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
    R2_PRIVATE_BUCKET: PRIVATE_BUCKET,
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

  it('still reads R2_BUCKET, the old name for the private bucket', async () => {
    // Renaming an env key is a deployment step somebody has to remember, and the
    // failure mode if they do not is the whole media surface answering 503. The
    // old name keeps working; the new pair only has to say which is which.
    const service = new StorageService({
      get: (key: string) =>
        ({
          R2_ACCOUNT_ID: 'acct',
          R2_ACCESS_KEY_ID: 'access-key',
          R2_SECRET_ACCESS_KEY: 'secret-key',
          R2_BUCKET: PRIVATE_BUCKET,
          R2_PUBLIC_BUCKET: PUBLIC_BUCKET,
          R2_PUBLIC_BASE_URL: 'https://cdn.example',
        })[key],
    } as unknown as ConfigService);

    expect(service.isConfigured).toBe(true);
    const clip = await service.createUploadUrl(playerMediaKey('player-1', 'goal.mp4'));
    expectBucket(clip.uploadUrl, PRIVATE_BUCKET, PUBLIC_BUCKET);
  });

  it('prefers R2_PRIVATE_BUCKET when both names are set', async () => {
    const service = storage({ R2_BUCKET: 'stale-legacy-bucket' });
    const clip = await service.createUploadUrl(playerMediaKey('player-1', 'goal.mp4'));
    expectBucket(clip.uploadUrl, PRIVATE_BUCKET, 'stale-legacy-bucket');
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

/**
 * Reads back the window a presigned URL actually carries.
 *
 * SigV4 puts both halves in the query string, so this asks the URL what it says
 * about itself rather than asking a mock what it was told — the same reasoning as
 * `expectBucket` above, and the only way to catch a signature that is well-formed
 * and already dead.
 */
function signedWindow(url: string) {
  const params = new URL(url).searchParams;
  // `20260818T123456Z` — SigV4's basic-format ISO 8601, which `Date` will not
  // parse until the separators are put back.
  const stamp = params.get('X-Amz-Date') ?? '';
  const signedAt = Date.parse(
    `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T` +
      `${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`,
  );
  const expiresIn = Number(params.get('X-Amz-Expires'));
  return { signedAt, expiresIn, expiresAt: signedAt + expiresIn * 1000 };
}

/**
 * A signed URL has to still be alive when the caller receives it.
 *
 * ## The bug this exists to prevent
 *
 * Signing time is rounded down to the top of the hour so a clip yields a
 * byte-identical URL all hour and the browser can reuse what it already
 * downloaded. That is free against the seven-day default: it costs at most an
 * hour out of a week.
 *
 * It is catastrophic against a short TTL, and silently so. A URL signed for
 * fifteen minutes *as of the top of the hour* has already expired for
 * forty-five minutes of every hour — the API returns a perfectly well-formed
 * link, R2 answers 403, and the page shows a poster that never loads and a video
 * that never starts. That is exactly what happened to players viewing their own
 * clips while those waited for moderation, which is what gave unreviewed clips a
 * short-lived signature in the first place.
 *
 * The rule is therefore: the rounding may never cost more life than the TTL can
 * spare. Both halves of it are pinned below.
 */
describe('StorageService read URL expiry', () => {
  const HOUR_MS = 60 * 60 * 1000;
  // Deliberately deep into an hour: at :34, a fifteen-minute TTL signed at the
  // top of the hour died nineteen minutes ago.
  const NOW = Date.parse('2026-08-18T12:34:56.000Z');
  const KEY = playerMediaKey('player-1', 'clip.mp4');

  beforeEach(() => {
    // Only the clock. The presigner is the real one here, and faking its timers
    // would leave its promises unresolved.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(NOW);
  });

  afterEach(() => jest.useRealTimers());

  it('signs a short-lived URL at the current time, not the top of the hour', async () => {
    const { url } = await storage().createReadUrl(KEY, 15 * 60);

    expect(signedWindow(url).signedAt).toBe(NOW);
  });

  it('hands out a short-lived URL with its full life still ahead of it', async () => {
    const { url } = await storage().createReadUrl(KEY, 15 * 60);

    const { expiresAt } = signedWindow(url);
    expect(expiresAt).toBeGreaterThan(NOW);
    expect(expiresAt - NOW).toBe(15 * 60 * 1000);
  });

  /* The cache optimisation is worth keeping where it is free — without it every
     page load re-downloads every clip it already had. */
  it('still rounds the seven-day default to the top of the hour', async () => {
    const { url } = await storage().createReadUrl(KEY);

    expect(signedWindow(url).signedAt).toBe(Math.floor(NOW / HOUR_MS) * HOUR_MS);
  });

  it('gives two reads within the same hour an identical long-lived URL', async () => {
    const first = await storage().createReadUrl(KEY);
    jest.setSystemTime(NOW + 20 * 60 * 1000);
    const second = await storage().createReadUrl(KEY);

    expect(first.url).toBe(second.url);
  });

  /*
   * The property, not the boundary: whatever TTLs this code grows in future, none
   * of them may be handed to a caller already expired.
   */
  it.each([60, 15 * 60, 60 * 60, 24 * 60 * 60, 7 * 24 * 60 * 60])(
    'never returns an already-expired URL for a %s-second TTL',
    async (ttl) => {
      const { url } = await storage().createReadUrl(KEY, ttl);

      expect(signedWindow(url).expiresAt).toBeGreaterThan(NOW);
    },
  );

  it('reports the deadline it actually signed for', async () => {
    const result = await storage().createReadUrl(KEY, 15 * 60);

    expect(Date.parse(result.expiresAt)).toBe(signedWindow(result.url).expiresAt);
  });
});
