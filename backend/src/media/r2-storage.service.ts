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
    const ext = filename.split('.').pop();
    return `players/${playerId}/${crypto.randomUUID()}.${ext}`;
  }

  /** Returns { uploadUrl, storageKey, publicUrl }. uploadUrl is a stub until
   * real R2 credentials are configured; see class doc above. */
  async getUploadUrl(playerId: string, filename: string) {
    const storageKey = this.buildKey(playerId, filename);
    const base = this.config.get<string>('R2_PUBLIC_BASE_URL') ?? '';
    return {
      uploadUrl: `${base}/__stub_presigned_put__/${storageKey}`,
      storageKey,
      publicUrl: `${base}/${storageKey}`,
    };
  }
}
