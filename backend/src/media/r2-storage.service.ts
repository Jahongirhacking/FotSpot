import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';

const UPLOAD_URL_TTL_SECONDS = 900;

/**
 * Cloudflare R2 (S3-compatible, README §1.7).
 *
 * ## Configured or not, it says which
 *
 * This used to return `.../__stub_presigned_put__/<key>` — a URL that looks like
 * an upload target and silently discards the bytes. A caller could not tell a
 * working upload from a vanished one, which is the worst of the three states to
 * be in.
 *
 * Now: with credentials, it issues a genuine presigned PUT and uploads work.
 * Without them, `getUploadUrl` throws 503 and `isConfigured` is false, so the UI
 * can say so up front rather than after a player has recorded a minute of video.
 *
 * The browser PUTs straight to R2 — video never transits the API, which is the
 * whole point of presigning on a platform whose users are on mobile data (§14).
 */
@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;

  constructor(private config: ConfigService) {
    const accountId = config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucket = config.get<string>('R2_BUCKET') ?? '';

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

  buildKey(playerId: string, filename: string) {
    return this.buildKeyUnder(`players/${playerId}`, filename);
  }

  /** Key under an explicit prefix, for objects that aren't player media. */
  buildKeyUnder(prefix: string, filename: string) {
    // Extension only, from the last dot: a filename is caller-supplied and must
    // never be able to steer the key outside its prefix.
    const ext = filename.includes('.')
      ? filename
          .split('.')
          .pop()!
          .replace(/[^a-z0-9]/gi, '')
      : 'bin';
    return `${prefix}/${crypto.randomUUID()}.${ext || 'bin'}`;
  }

  async getUploadUrl(playerId: string, filename: string, contentType?: string) {
    return this.presign(this.buildKey(playerId, filename), contentType);
  }

  /** Avatars live under `avatars/`, not under `players/` — they belong to a user. */
  async getAvatarUploadUrl(userId: string, filename: string, contentType?: string) {
    return this.presign(this.buildKeyUnder(`avatars/${userId}`, filename), contentType);
  }

  private async presign(storageKey: string, contentType?: string) {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Media storage is not configured on this server, so uploads cannot be accepted yet.',
      );
    }

    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ...(contentType ? { ContentType: contentType } : {}),
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );

    const base = this.config.get<string>('R2_PUBLIC_BASE_URL') ?? '';
    return {
      uploadUrl,
      storageKey,
      publicUrl: `${base}/${storageKey}`,
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    };
  }
}
