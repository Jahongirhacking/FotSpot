import type { MediaModerationStatus, MediaStatus } from '@prisma/client';
import { toMediaResponse } from './media.service';
import type { StorageService } from '../storage/storage.service';

/**
 * How a media row becomes something a browser can play.
 *
 * The contract every clip screen depends on: `storageKey` and `posterKey` go
 * in, `url` and `posterUrl` come out, both minted by StorageService from the
 * keys as stored. These pin the shape so a change to the row, the DTO or the
 * URL builder cannot silently hand the client a key instead of an address, a
 * null where a poster exists, or a clip that fails because its cover is gone.
 */

const ROW: {
  id: string;
  playerId: string;
  status: MediaStatus;
  moderationStatus: MediaModerationStatus;
  storageKey: string;
  posterKey: string | null;
  title: string | null;
} = {
  id: 'clip-1',
  playerId: 'player-1',
  status: 'ACTIVE',
  moderationStatus: 'VERIFIED',
  storageKey: 'private/players/player-1/a80465b0.webm',
  posterKey: 'private/players/player-1/1df68d27.jpg',
  title: 'Sprint',
};

/** Signs whatever key it is given, the way the real builder does, or nothing. */
function storage(configured = true) {
  return {
    readUrlOrNull: jest.fn(async (key: string | null | undefined) =>
      key && configured ? `https://signed.example/${key}?X-Amz-Signature=sig` : null,
    ),
  };
}

describe('toMediaResponse — a row on the way out', () => {
  it('replaces both keys with signed URLs built from those exact keys', async () => {
    const s = storage();

    const out = await toMediaResponse(ROW, s as unknown as StorageService);

    expect(out.url).toBe(`https://signed.example/${ROW.storageKey}?X-Amz-Signature=sig`);
    expect(out.posterUrl).toBe(`https://signed.example/${ROW.posterKey}?X-Amz-Signature=sig`);
    expect(s.readUrlOrNull).toHaveBeenCalledWith(ROW.storageKey, undefined);
    expect(s.readUrlOrNull).toHaveBeenCalledWith(ROW.posterKey, undefined);
  });

  /* A key is an internal address; a client holding one starts building URLs. */
  it('never sends the storage keys themselves', async () => {
    const out = await toMediaResponse(ROW, storage() as unknown as StorageService);

    expect(out).not.toHaveProperty('storageKey');
    expect(out).not.toHaveProperty('posterKey');
    expect(JSON.stringify(out)).not.toContain('private/players/player-1/a80465b0.webm"');
  });

  it('keeps every other column', async () => {
    const out = await toMediaResponse(ROW, storage() as unknown as StorageService);

    expect(out).toMatchObject({
      id: 'clip-1',
      playerId: 'player-1',
      status: 'ACTIVE',
      moderationStatus: 'VERIFIED',
      title: 'Sprint',
    });
  });

  /*
   * Capture can fail in the browser and a cover can be dropped by the finaliser.
   * A clip without one is still a clip: the URL is there, the poster is null,
   * and nothing throws.
   */
  it('gives a clip with no cover a playable URL and a null poster', async () => {
    const out = await toMediaResponse(
      { ...ROW, posterKey: null },
      storage() as unknown as StorageService,
    );

    expect(out.url).toContain(ROW.storageKey);
    expect(out.posterUrl).toBeNull();
  });

  /* The key's extension is not consulted: a transcoded clip keeps the name it
     was uploaded under, and the object's content type is what the browser
     reads. */
  it('signs a .webm key exactly like an .mp4 one', async () => {
    const s = storage();

    await toMediaResponse(
      { ...ROW, storageKey: 'private/players/player-1/x.mp4' },
      s as unknown as StorageService,
    );
    await toMediaResponse(ROW, s as unknown as StorageService);

    expect(s.readUrlOrNull).toHaveBeenCalledWith('private/players/player-1/x.mp4', undefined);
    expect(s.readUrlOrNull).toHaveBeenCalledWith(ROW.storageKey, undefined);
  });

  it('answers with null URLs, not an error, when storage is not configured', async () => {
    const out = await toMediaResponse(ROW, storage(false) as unknown as StorageService);

    expect(out.url).toBeNull();
    expect(out.posterUrl).toBeNull();
  });

  it('signs the poster for the same lifetime as its clip', async () => {
    const s = storage();

    await toMediaResponse(
      { ...ROW, moderationStatus: 'UNVERIFIED' },
      s as unknown as StorageService,
    );

    expect(s.readUrlOrNull).toHaveBeenCalledWith(ROW.storageKey, 15 * 60);
    expect(s.readUrlOrNull).toHaveBeenCalledWith(ROW.posterKey, 15 * 60);
  });
});
