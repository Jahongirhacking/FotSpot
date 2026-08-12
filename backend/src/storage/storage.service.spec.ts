import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { academyMediaKey, avatarKey, playerMediaKey, playerPosterKey } from './storage.keys';

const PRIVATE_BUCKET = 'fotspot-clips-private';
const PUBLIC_BUCKET = 'fotspot-faces-public';

function storage(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    R2_ACCOUNT_ID: 'acct',
    R2_ACCESS_KEY_ID: 'access-key',
    R2_SECRET_ACCESS_KEY: 'secret-key',
    R2_BUCKET: PRIVATE_BUCKET,
    R2_PUBLIC_BUCKET: PUBLIC_BUCKET,
    R2_PUBLIC_BASE_URL: 'https://cdn.example',
    ...overrides,
  };
  return new StorageService({ get: (key: string) => values[key] } as unknown as ConfigService);
}

/**
 * Presigned URLs carry their bucket — as a host prefix in virtual-hosted style, in
 * the path under path style — so asserting on the URL tests the real signing path
 * rather than a mock's arguments. Both buckets are checked every time: "names the
 * right one" and "does not name the wrong one" fail differently, and only the
 * second catches a fallback quietly sending everything to one bucket.
 */
function expectBucket(url: string, expected: string, notExpected: string) {
  expect(url).toContain(expected);
  expect(url).not.toContain(notExpected);
}

describe('StorageService bucket routing', () => {
  /*
   * The bug this is here for: public objects were written to the private bucket
   * and linked from the public host. Nothing threw. The presigned PUT succeeded,
   * the row saved, the URL was well-formed — and every avatar 404'd, in a UI that
   * falls back to initials when an avatar is missing, so it did not even look
   * broken. A key's tier has to pick the bucket on both sides of the round trip.
   */
  it('uploads public keys to the public bucket and private keys to the private one', async () => {
    const service = storage();

    const avatar = await service.createUploadUrl(avatarKey('user-1', 'me.jpg'));
    expectBucket(avatar.uploadUrl, PUBLIC_BUCKET, PRIVATE_BUCKET);

    const logo = await service.createUploadUrl(academyMediaKey('academy-1', 'crest.png'));
    expectBucket(logo.uploadUrl, PUBLIC_BUCKET, PRIVATE_BUCKET);

    const clip = await service.createUploadUrl(playerMediaKey('player-1', 'goal.mp4'));
    expectBucket(clip.uploadUrl, PRIVATE_BUCKET, PUBLIC_BUCKET);

    // The cover frame is shown wherever the clip is listed, which makes it the
    // obvious candidate for "just make this one public". It is a still of the
    // same child, so it follows the video.
    const poster = await service.createUploadUrl(playerPosterKey('player-1'));
    expectBucket(poster.uploadUrl, PRIVATE_BUCKET, PUBLIC_BUCKET);
  });

  it('reads a key back from the bucket it was written to', async () => {
    const service = storage();

    const clip = await service.createReadUrl(playerMediaKey('player-1', 'goal.mp4'));
    expectBucket(clip.url, PRIVATE_BUCKET, PUBLIC_BUCKET);

    const avatar = await service.createReadUrl(avatarKey('user-1', 'me.jpg'));
    expectBucket(avatar.url, PUBLIC_BUCKET, PRIVATE_BUCKET);
  });

  it('falls back to the single bucket when no public bucket is named', async () => {
    // The prior deployment shape, still supported: one bucket holding both tiers,
    // with R2 public read scoped to `public/`.
    for (const unset of ['', '   ']) {
      const service = storage({ R2_PUBLIC_BUCKET: unset });
      const avatar = await service.createUploadUrl(avatarKey('user-1', 'me.jpg'));
      expect(avatar.uploadUrl).toContain(PRIVATE_BUCKET);
      expect(avatar.uploadUrl).not.toContain(PUBLIC_BUCKET);
    }
  });

  it('refuses to build a public URL for a private key, whatever the buckets are', async () => {
    // Two buckets make the tiers physically separate, which is a reason to relax
    // this and exactly why it should not be relaxed: the guarantee is that no
    // code path can hand out a permanent, unrevocable link to a child's video.
    const service = storage();
    expect(() => service.buildPublicUrl(playerMediaKey('player-1', 'goal.mp4'))).toThrow(
      /private key/i,
    );

    const key = avatarKey('user-1', 'me.jpg');
    expect(service.buildPublicUrl(key)).toBe(`https://cdn.example/${key}`);
  });

  it('serves public URLs from the CDN host, not from either bucket endpoint', () => {
    // The public bucket's name never appears in a URL a user sees: it is reached
    // through the CDN domain, which is what makes it swappable.
    const service = storage();
    const url = service.publicUrlOrNull(avatarKey('user-1', 'me.jpg'));
    expect(url).toMatch(/^https:\/\/cdn\.example\/public\/avatars\/user-1\//);
    expect(url).not.toContain(PUBLIC_BUCKET);
  });
});
