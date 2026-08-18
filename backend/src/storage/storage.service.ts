import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isPublicKey } from './storage.keys';

const UPLOAD_URL_TTL_SECONDS = 900;

/**
 * The SigV4 maximum, and deliberately so.
 *
 * A clip is meant to stay reachable until its player deletes it. A presigned URL
 * cannot express "never expires", so the next best thing is the longest life the
 * signature format allows, combined with minting a fresh one on every read — the
 * app therefore never hands out a URL that is close to expiring, and nobody
 * watching or sharing one runs into a deadline.
 */
const READ_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Signing time is rounded down to this, so the same object yields the *same* URL
 * for an hour at a time.
 *
 * Without it every response carries a new signature, which means a byte-identical
 * video is a cache miss on every page load — the browser cannot reuse what it
 * already downloaded. On the connections these users have (§14) that is the
 * difference between a clip loading instantly on second view and paying for it
 * twice. Rounding down never shortens usable life below six days.
 */
const SIGNING_WINDOW_MS = 60 * 60 * 1000;

/**
 * The one place an object key becomes a URL — Cloudflare R2 (README §1.7).
 *
 * ## Two buckets, and the key prefix picks between them
 *
 * - `R2_PRIVATE_BUCKET` — player clips and their cover frames. Nothing in it is
 *   reachable without a signature this API mints, and it has no public domain.
 *   (`R2_BUCKET` is the former name and is still read.)
 * - `R2_PUBLIC_BUCKET` — served at `R2_PUBLIC_BASE_URL`. Avatars, academy logos
 *   and academy gallery images: things an account published as its own face.
 *
 * The `public/` prefix on a key is what routes it, so a key's tier decides which
 * bucket it is written to *and* read from, and the two can never disagree. Get
 * that wrong and the failure is silent in the worst way: the upload succeeds, the
 * URL is well-formed, and the image 404s — which is exactly what happened while
 * public objects were being written to the private bucket and linked from the
 * public host. `pnpm r2:check` exists to catch that round trip.
 *
 * One API token must be authorized for **both** buckets. A token scoped to one
 * presigns happily and fails at PUT time, in the browser, for whichever half it
 * does not cover — so the symptom is "avatars are broken" rather than anything
 * naming a permission.
 *
 * `R2_PUBLIC_BUCKET` falls back to the private bucket for the single-bucket
 * deployment, where one bucket holds both tiers and public read is scoped to
 * `public/`. That setup still works; it just needs the bucket policy to do the
 * job the second bucket does here.
 *
 * ## Two kinds of URL, and only one of them is permanent
 *
 * - `buildPublicUrl` — a plain CDN URL, and **only** for `public/` keys. Avatars
 *   and academy imagery are meant to be cached and hotlinked, and they cost
 *   nothing to serve twice.
 * - `createReadUrl` — a signed URL for a `private/` key, issued only after the
 *   caller has been authorized. This is how every clip is played, and how the
 *   §12.1 identity documents will be read.
 *
 * `buildPublicUrl` throws on a private key. That refusal is the whole point of
 * having two builders: the split is "safe to link forever" against "must be
 * authorized every time", and a builder that could quietly publish the second
 * kind — a minute of footage of a child — is the mistake worth making
 * impossible rather than merely unlikely.
 *
 * With no credentials, presigning throws 503 and `isConfigured` is false, so the
 * UI can say so up front rather than after a player has recorded a minute of
 * video. Nothing here ever pretends an upload worked.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly privateBucket: string;
  private readonly publicBucket: string;
  private readonly publicBaseUrl: string;

  constructor(private config: ConfigService) {
    const accountId = config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');

    // `||` throughout, not the `??` the style guide asks for: an empty bucket
    // name is not a legitimate value the way an empty string or a zero port can
    // be, so an `R2_PUBLIC_BUCKET=""` left behind in a .env should fall through
    // rather than presign uploads against a bucket called "".
    const bucket = (key: string) => (config.get<string>(key) ?? '').trim();

    // `R2_BUCKET` is the old name for the private bucket, from when there was
    // only one and the tier lived in the key prefix alone. Still read, so an
    // environment that has not been updated keeps working — but the pair of names
    // now says which bucket is which, which is the whole difficulty here.
    this.privateBucket = bucket('R2_PRIVATE_BUCKET') || bucket('R2_BUCKET');
    this.publicBucket = bucket('R2_PUBLIC_BUCKET') || this.privateBucket;
    this.publicBaseUrl = (config.get<string>('R2_PUBLIC_BASE_URL') ?? '').replace(/\/+$/, '');

    // Now that clips are public too, this is not a cosmetic gap: every endpoint
    // that returns a clip builds its URL from this, so an unset value takes the
    // whole media surface down with a 503. Separate from the credential warning
    // because the failure is different — uploads still presign fine, and it is
    // reading them back that breaks.
    if (!this.publicBaseUrl) {
      this.logger.error(
        'R2_PUBLIC_BASE_URL is not set, so uploaded clips and avatars have no ' +
          'address and cannot be played or shown. Uploads still work and nothing ' +
          'is lost. To fix: Cloudflare → R2 → your bucket → Settings → Public ' +
          'Development URL → Enable, then put that https://pub-….r2.dev origin ' +
          '(or your own custom domain) in R2_PUBLIC_BASE_URL.',
      );
    }

    if (accountId && accessKeyId && secretAccessKey && this.privateBucket) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });

      // Worth saying at boot, because the two setups fail in opposite directions
      // and the logs are where you find out which one you are running: two
      // buckets need an API token authorized for *both*, one bucket needs public
      // read scoped to `public/`.
      if (this.publicBucket !== this.privateBucket) {
        this.logger.log(
          `R2: private "${this.privateBucket}", public "${this.publicBucket}" at ` +
            `${this.publicBaseUrl || '(no public base URL)'}`,
        );
      } else {
        // A warning, not a note. One bucket serving both tiers is a legitimate
        // deployment, but it is also exactly what an unset R2_PUBLIC_BUCKET looks
        // like — and the two are indistinguishable from here. Both readings have
        // a consequence somebody needs to have decided on, so neither is allowed
        // to pass quietly.
        this.logger.warn(
          `R2: one bucket "${this.privateBucket}" is serving both tiers, because ` +
            'R2_PUBLIC_BUCKET is unset. If that is deliberate, public read must be scoped to ' +
            'public/ or every clip is anonymously downloadable at the CDN host. If it is not, ' +
            'avatars and academy images are being written here and linked from ' +
            `${this.publicBaseUrl || 'the public host'}, where they will 404. ` +
            '`pnpm r2:check` settles which.',
        );
      }
    } else {
      this.client = null;
      this.logger.warn(
        'R2 is not configured — uploads will be refused with 503. Set R2_ACCOUNT_ID, ' +
          'R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_PRIVATE_BUCKET to enable them.',
      );
    }
  }

  /** Lets callers warn *before* a player records a video that cannot be stored. */
  get isConfigured() {
    return this.client !== null;
  }

  /**
   * Which bucket a key belongs in — the single decision that keeps the tiers apart.
   *
   * Derived from the key rather than passed in by the caller, so writing and
   * reading an object can never pick differently. A caller that had to name the
   * bucket would eventually name the wrong one on one side of the round trip, and
   * that mistake is invisible until an image 404s in production.
   */
  private bucketFor(storageKey: string): string {
    return isPublicKey(storageKey) ? this.publicBucket : this.privateBucket;
  }

  /**
   * Permanent CDN URL for a public object.
   *
   * Throws on a private key. A caller reaching this with one has made a category
   * error, and the right outcome is a 500 in a test rather than a permanent
   * public link to a minor's video in production.
   */
  buildPublicUrl(storageKey: string): string {
    if (!isPublicKey(storageKey)) {
      throw new Error(
        `Refusing to build a public URL for a private key (${storageKey.split('/')[0]}/…). ` +
          'Private objects are reachable only through StorageService.createReadUrl.',
      );
    }
    if (!this.publicBaseUrl) {
      throw new ServiceUnavailableException(
        'R2_PUBLIC_BASE_URL is not configured, so public asset URLs cannot be built.',
      );
    }
    return `${this.publicBaseUrl}/${storageKey}`;
  }

  /**
   * Convenience for the many `avatarKey: string | null` columns.
   *
   * Returns null rather than throwing when the public base is unset. An avatar is
   * decoration: a missing one falls back to initials (see the client's Avatar),
   * whereas a throw here would take down every endpoint that returns a person —
   * the user directory, the weekly boards, the whole profile screen — over a
   * picture. `buildPublicUrl` still throws for callers that asked for a URL
   * outright and would otherwise be handed a broken relative path.
   */
  publicUrlOrNull(storageKey: string | null | undefined): string | null {
    if (!storageKey || !this.publicBaseUrl) return null;
    return this.buildPublicUrl(storageKey);
  }

  /**
   * Swaps a stored `avatarKey` for a runtime `avatarUrl` on any row carrying one.
   *
   * Every service that returns a person needs this, and each hand-rolled version
   * is a chance to leak the key or forget the swap — so there is exactly one.
   */
  withAvatarUrl<T extends { avatarKey?: string | null }>(
    row: T,
  ): Omit<T, 'avatarKey'> & { avatarUrl: string | null } {
    const { avatarKey, ...rest } = row;
    return { ...rest, avatarUrl: this.publicUrlOrNull(avatarKey) };
  }

  /** Presigned PUT. The browser uploads straight to R2, so bytes never transit
   *  the API — which is the point on mobile data (§14). */
  async createUploadUrl(storageKey: string, contentType?: string) {
    const client = this.require();
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: this.bucketFor(storageKey),
        Key: storageKey,
        ...(contentType ? { ContentType: contentType } : {}),
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
    return { uploadUrl, storageKey, expiresIn: UPLOAD_URL_TTL_SECONDS };
  }

  /**
   * Signed GET for an object, valid for a week and stable within the hour.
   *
   * This performs **no authorization of its own**, by design. Whether the caller
   * may see the object is a decision for the endpoint, where a reviewer will
   * notice it; buried in a URL builder it would be invisible.
   */
  async createReadUrl(storageKey: string, ttlSeconds = READ_URL_TTL_SECONDS) {
    const client = this.require();
    const signingDate = new Date(Math.floor(Date.now() / SIGNING_WINDOW_MS) * SIGNING_WINDOW_MS);

    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucketFor(storageKey), Key: storageKey }),
      { expiresIn: ttlSeconds, signingDate },
    );
    return {
      url,
      expiresIn: ttlSeconds,
      expiresAt: new Date(signingDate.getTime() + ttlSeconds * 1000).toISOString(),
    };
  }

  /**
   * `createReadUrl`, but null instead of throwing when storage is unconfigured.
   *
   * For response builders. A server with no R2 credentials should still be able
   * to list clips — the rows exist and everything except playback works — and
   * taking the whole endpoint down over it is the failure this replaces.
   */
  async readUrlOrNull(
    storageKey: string | null | undefined,
    ttlSeconds?: number,
  ): Promise<string | null> {
    if (!storageKey || !this.client) return null;
    return (await this.createReadUrl(storageKey, ttlSeconds)).url;
  }

  /**
   * Removes an object. Succeeds whether or not it was there.
   *
   * S3 delete is idempotent by definition — a missing key answers 204 — so this
   * throws only on something a caller should hear about: no credentials, no
   * network, a bucket policy. Callers cleaning up after a *successful* database
   * write should still not fail their request over it; see `UsersService`.
   */
  async deleteObject(storageKey: string): Promise<void> {
    const client = this.require();
    await client.send(
      new DeleteObjectCommand({ Bucket: this.bucketFor(storageKey), Key: storageKey }),
    );
  }

  /**
   * What the bucket actually holds at `storageKey`, or null if nothing does.
   *
   * The one question the upload flow could never answer. A presigned PUT goes
   * from the browser straight to R2, so the API only ever hears about it second
   * hand: `confirmUpload` is the client saying "I uploaded that", and a client
   * that crashed, lost signal or simply lied produced a `Media` row pointing at
   * an object that was never written. This is how the media worker checks
   * (see MediaProcessor).
   *
   * Distinguishes "not there" from "could not ask": a missing object answers
   * null, and anything else — credentials, network, a bucket policy — throws, so
   * the worker retries instead of condemning a clip that may be perfectly fine.
   */
  async describeObject(
    storageKey: string,
  ): Promise<{ size: number; contentType?: string; lastModified?: Date } | null> {
    const client = this.require();
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: this.bucketFor(storageKey), Key: storageKey }),
      );
      return {
        size: head.ContentLength ?? 0,
        contentType: head.ContentType,
        lastModified: head.LastModified,
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode;
      if (status === 404 || (error as { name?: string })?.name === 'NotFound') return null;
      throw error;
    }
  }

  private require(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Media storage is not configured on this server, so uploads cannot be accepted yet.',
      );
    }
    return this.client;
  }
}
