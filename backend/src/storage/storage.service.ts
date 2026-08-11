import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
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
 * ## Two kinds of URL, and only one of them is permanent
 *
 * - `publicUrl` — a plain CDN URL, and **only** for `public/` keys. Avatars and
 *   player clips: both are meant to be watched, cached and hotlinked, and a clip
 *   stays reachable until its player deletes it.
 * - `createReadUrl` — a signed, minutes-long URL for a `private/` key, issued
 *   only after the caller has been authorized. Nothing uses it today; it is kept
 *   for the §12.1 identity documents, where a permanent link would be wrong.
 *
 * `buildPublicUrl` still refuses private keys. The tiers no longer split media
 * from avatars, but they do split "safe to link forever" from "must be
 * authorized every time", and a builder that silently published the second kind
 * is exactly the mistake worth making impossible.
 *
 * With no credentials, presigning throws 503 and `isConfigured` is false, so the
 * UI can say so up front rather than after a player has recorded a minute of
 * video. Nothing here ever pretends an upload worked.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private config: ConfigService) {
    const accountId = config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucket = config.get<string>('R2_BUCKET') ?? '';
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

    if (accountId && accessKeyId && secretAccessKey && this.bucket) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
    } else {
      this.client = null;
      this.logger.warn(
        'R2 is not configured — uploads will be refused with 503. Set R2_ACCOUNT_ID, ' +
          'R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET to enable them.',
      );
    }
  }

  /** Lets callers warn *before* a player records a video that cannot be stored. */
  get isConfigured() {
    return this.client !== null;
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
        Bucket: this.bucket,
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
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
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
  async readUrlOrNull(storageKey: string | null | undefined): Promise<string | null> {
    if (!storageKey || !this.client) return null;
    return (await this.createReadUrl(storageKey)).url;
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
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
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
