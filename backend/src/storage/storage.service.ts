import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isPublicKey } from './storage.keys';

const UPLOAD_URL_TTL_SECONDS = 900;

/**
 * Read URLs live about as long as it takes to click play.
 *
 * Long enough to survive a slow handshake on 3G and a user who paused to read the
 * caption; short enough that a URL pasted into a group chat is dead before it
 * arrives. S3-compatible stores validate the signature when the request *starts*,
 * so an in-flight download is unaffected by expiry — this bounds sharing, not
 * playback.
 */
const READ_URL_TTL_SECONDS = 300;

/**
 * The one place an object key becomes a URL — Cloudflare R2 (README §1.7).
 *
 * ## Two kinds of URL, and only one of them is permanent
 *
 * - `publicUrl` — a plain CDN URL, and **only** for `public/` keys. Avatars are
 *   meant to be cached, hotlinked and indexed, so a permanent URL is the point.
 * - `createReadUrl` — a signed, minutes-long URL for a `private/` key, issued
 *   only after the caller has been authorized. Never stored, never returned in a
 *   list response, never guessable.
 *
 * `buildPublicUrl` refuses private keys rather than trusting every future caller
 * to remember which tier they hold. That is the whole failure mode this refactor
 * exists to remove: one careless `${base}/${key}` and a child's video is on the
 * open internet permanently, with nothing to revoke.
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
    return `${this.publicBaseUrl}/${storageKey}`;
  }

  /** Convenience for the many `avatarKey: string | null` columns. */
  publicUrlOrNull(storageKey: string | null | undefined): string | null {
    return storageKey ? this.buildPublicUrl(storageKey) : null;
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
   * Short-lived signed GET for a private object.
   *
   * **Call this only after authorizing the caller.** It performs no checks of its
   * own by design — an authorization decision made inside a URL builder is one
   * nobody reviewing the endpoint will see.
   */
  async createReadUrl(storageKey: string, ttlSeconds = READ_URL_TTL_SECONDS) {
    const client = this.require();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      { expiresIn: ttlSeconds },
    );
    return {
      url,
      expiresIn: ttlSeconds,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
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
