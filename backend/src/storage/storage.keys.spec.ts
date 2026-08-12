import { ForbiddenException } from '@nestjs/common';
import {
  academyMediaKey,
  assertKeyUnder,
  avatarKey,
  avatarPrefix,
  isPrivateKey,
  isPublicKey,
  playerMediaKey,
  playerMediaPrefix,
  playerPosterKey,
  safeExtension,
} from './storage.keys';

describe('safeExtension', () => {
  it('keeps a plain extension, lowercased', () => {
    expect(safeExtension('clip.MP4')).toBe('mp4');
    expect(safeExtension('photo.jpeg')).toBe('jpeg');
  });

  it('takes only the last extension', () => {
    expect(safeExtension('archive.tar.gz')).toBe('gz');
  });

  it('cannot smuggle a path separator or traversal out of a filename', () => {
    expect(safeExtension('x.../../../etc/passwd')).toBe('etcpasswd'.slice(0, 10));
    expect(safeExtension('evil.jpg/../../secret')).not.toContain('/');
    expect(safeExtension('evil.jpg/../../secret')).not.toContain('.');
  });

  it('falls back rather than emitting an empty extension', () => {
    expect(safeExtension('noextension')).toBe('bin');
    expect(safeExtension('trailing.')).toBe('bin');
    expect(safeExtension('.hidden')).toBe('hidden');
  });
});

describe('key tiers', () => {
  it('publishes avatars and academy imagery, and keeps clips private', () => {
    /*
     * The split that matters, and the one this file exists to make impossible to
     * get wrong: an avatar is a thumbnail somebody chose as their face, and a
     * clip is a minute of video of a child at a training ground. The first gets
     * a permanent CDN address; the second is reachable only through a signature
     * this API mints, so deleting the row actually ends access.
     */
    expect(isPublicKey(avatarKey('user-1', 'a.jpg'))).toBe(true);
    expect(isPrivateKey(avatarKey('user-1', 'a.jpg'))).toBe(false);

    expect(isPublicKey(academyMediaKey('academy-1', 'stadium.jpg'))).toBe(true);

    expect(isPrivateKey(playerMediaKey('player-1', 'clip.mp4'))).toBe(true);
    expect(isPublicKey(playerMediaKey('player-1', 'clip.mp4'))).toBe(false);
  });

  it('keeps a clip poster in the same tier as the clip', () => {
    // A still frame of the video is the same content at lower resolution, so a
    // public poster for a private clip would leak exactly what the tier hides.
    expect(isPrivateKey(playerPosterKey('player-1'))).toBe(true);
  });

  it('never reuses a key', () => {
    const keys = new Set(Array.from({ length: 200 }, () => playerMediaKey('p1', 'clip.mp4')));
    expect(keys.size).toBe(200);
  });

  it('scopes keys to their owner', () => {
    expect(playerMediaKey('p1', 'a.mp4').startsWith(playerMediaPrefix('p1'))).toBe(true);
    expect(playerMediaKey('p1', 'a.mp4').startsWith(playerMediaPrefix('p2'))).toBe(false);
  });
});

describe('assertKeyUnder', () => {
  const mine = playerMediaPrefix('player-1');

  it('accepts a key we issued for this owner', () => {
    expect(() => assertKeyUnder(playerMediaKey('player-1', 'clip.mp4'), mine)).not.toThrow();
  });

  it("rejects another player's directory", () => {
    expect(() => assertKeyUnder(playerMediaKey('player-2', 'clip.mp4'), mine)).toThrow(
      ForbiddenException,
    );
  });

  it('rejects traversal out of the prefix', () => {
    expect(() => assertKeyUnder(`${mine}../player-2/clip.mp4`, mine)).toThrow(ForbiddenException);
    expect(() => assertKeyUnder(`${mine}a//b`, mine)).toThrow(ForbiddenException);
  });

  it('rejects percent-encoded traversal too', () => {
    // `..%2F` cannot reach outside the prefix by itself, but it only exists in a
    // key because someone was probing for a decoding layer that would let it. No
    // legitimate producer emits `..` in an object name, so the whole shape goes.
    expect(() => assertKeyUnder(`${mine}..%2Fplayer-2%2Fclip.mp4`, mine)).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a prefix-lookalike directory', () => {
    // `public/players/player-10/` starts with `public/players/player-1` as a
    // string, which is why prefixes carry their trailing slash. Still the check
    // that matters most: it is what stops one player writing into another's
    // directory, and it is unaffected by which tier they live in.
    expect(() => assertKeyUnder('public/players/player-10/clip.mp4', mine)).toThrow(
      ForbiddenException,
    );
  });

  it("rejects another owner's directory even within the same tier", () => {
    // Avatars and clips now share the public tier, so the prefix is doing all
    // the work: an avatar key is still not somewhere a clip may be written.
    expect(() => assertKeyUnder(avatarKey('player-1', 'a.jpg'), mine)).toThrow(ForbiddenException);
    expect(() => assertKeyUnder(playerMediaKey('p1', 'a.mp4'), avatarPrefix('p1'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects absent, absurd and absolute keys', () => {
    expect(() => assertKeyUnder('', mine)).toThrow(ForbiddenException);
    expect(() => assertKeyUnder(`/${mine}clip.mp4`, mine)).toThrow(ForbiddenException);
    expect(() => assertKeyUnder(`${mine}${'x'.repeat(600)}`, mine)).toThrow(ForbiddenException);
  });
});
