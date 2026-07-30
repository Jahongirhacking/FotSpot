import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Minimal abstraction over Cloudflare R2 (S3-compatible, per README 1.7).
 * MVP implementation returns a deterministic key + the public base URL;
 * swap `getUploadUrl` for a real presigned-PUT call (@aws-sdk/client-s3 or
 * @aws-sdk/s3-request-presigner against the R2 endpoint) once credentials
 * are available - the rest of the app only depends on this interface.
 */
@Injectable()
export class R2StorageService {
  constructor(private config: ConfigService) {}

  buildKey(playerId: string, filename: string) {
    return this.buildKeyUnder(`players/${playerId}`, filename);
  }

  /** Key under an explicit prefix, for objects that aren't player media. */
  buildKeyUnder(prefix: string, filename: string) {
    // Extension only, from the last dot: a filename is caller-supplied and must
    // never be able to steer the key outside its prefix.
    const ext = filename.includes('.') ? filename.split('.').pop()!.replace(/[^a-z0-9]/gi, '') : 'bin';
    return `${prefix}/${crypto.randomUUID()}.${ext || 'bin'}`;
  }

  /** Returns { uploadUrl, storageKey, publicUrl }. uploadUrl is a stub until
   * real R2 credentials are configured; see class doc above. */
  async getUploadUrl(playerId: string, filename: string) {
    return this.presign(this.buildKey(playerId, filename));
  }

  /** Avatars live under `avatars/`, not under `players/` — they belong to a user. */
  async getAvatarUploadUrl(userId: string, filename: string) {
    return this.presign(this.buildKeyUnder(`avatars/${userId}`, filename));
  }

  private presign(storageKey: string) {
    const base = this.config.get<string>('R2_PUBLIC_BASE_URL') ?? '';
    return {
      uploadUrl: `${base}/__stub_presigned_put__/${storageKey}`,
      storageKey,
      publicUrl: `${base}/${storageKey}`,
    };
  }
}
