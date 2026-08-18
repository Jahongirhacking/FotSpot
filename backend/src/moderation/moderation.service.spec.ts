import { ConflictException, NotFoundException } from '@nestjs/common';
import type { MediaModerationStatus, MediaStatus } from '@prisma/client';
import { ModerationService } from './moderation.service';
import { AuditAction } from '../audit/audit.actions';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { StorageService } from '../storage/storage.service';

/**
 * The admin half of video moderation: what the queue offers, what the two
 * decisions do, and what happens when two moderators act on the same clip.
 *
 * Prisma is a fake rather than a real database — the rules under test are the
 * service's, not Postgres's, and the one place that distinction matters (the
 * conditional `updateMany` that makes concurrent decisions safe) is asserted on
 * the *shape of the statement*, which is exactly where the safety lives.
 */

const CLIP: {
  id: string;
  playerId: string;
  status: MediaStatus;
  moderationStatus: MediaModerationStatus;
  storageKey: string;
  posterKey: string | null;
} = {
  id: 'clip-1',
  playerId: 'player-1',
  status: 'ACTIVE',
  moderationStatus: 'UNVERIFIED',
  storageKey: 'private/players/player-1/clip.mp4',
  posterKey: 'private/players/player-1/poster.jpg',
};

function build(clip: Partial<typeof CLIP> & Record<string, unknown> = {}) {
  const row = { ...CLIP, ...clip };

  const prisma = {
    media: {
      findUnique: jest.fn(async (): Promise<unknown> => row),
      findUniqueOrThrow: jest.fn(async (): Promise<unknown> => row),
      findMany: jest.fn(async (): Promise<unknown> => []),
      count: jest.fn(async () => 0),
      // One row matched: nobody else got there first.
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async (): Promise<unknown> => row),
      delete: jest.fn(async (): Promise<unknown> => row),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  const audit = { record: jest.fn(async () => undefined) };
  const redis = { del: jest.fn(async () => undefined) };
  const storage = {
    readUrlOrNull: jest.fn(async () => 'https://signed.example/clip'),
    publicUrlOrNull: jest.fn(() => null),
    deleteObject: jest.fn(async () => undefined),
  };

  const service = new ModerationService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    storage as unknown as StorageService,
    redis as unknown as RedisService,
  );

  return { service, prisma, audit, redis, storage };
}

describe('listUnverifiedMedia — what a moderator is shown', () => {
  it('asks for unreviewed clips only, and only ones whose bytes arrived', async () => {
    const { service, prisma } = build();

    await service.listUnverifiedMedia({});

    expect(prisma.media.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', moderationStatus: 'UNVERIFIED' },
      }),
    );
  });

  /*
   * Newest first, unlike the report queue beside it. Nothing in this queue is
   * visible to anybody yet, so the cost being paid is a player watching their own
   * upload sit in limbo — the person who just pressed upload is served first.
   */
  it('puts the newest upload at the front of the queue', async () => {
    const { service, prisma } = build();

    await service.listUnverifiedMedia({});

    expect(prisma.media.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('carries the player, so a decision does not need a second request', async () => {
    const { service, prisma } = build();
    prisma.media.findMany.mockResolvedValue([
      {
        ...CLIP,
        createdAt: new Date(),
        player: {
          id: 'player-1',
          firstName: 'John',
          lastName: 'Doe',
          birthDate: new Date('2010-01-01'),
          primaryPosition: 'ST',
          region: 'Tashkent',
          district: 'Yunusabad',
          user: { id: 'user-1', avatarKey: null, username: 'johndoe' },
        },
      },
    ]);
    prisma.media.count.mockResolvedValue(1);

    const page = await service.listUnverifiedMedia({});

    expect(page.items[0]).toEqual(
      expect.objectContaining({
        id: 'clip-1',
        url: 'https://signed.example/clip',
        player: expect.objectContaining({ firstName: 'John', userId: 'user-1' }),
      }),
    );
  });

  it('never leaks the storage key, in the queue as anywhere else', async () => {
    const { service, prisma } = build();
    prisma.media.findMany.mockResolvedValue([
      { ...CLIP, createdAt: new Date(), player: { user: {} } },
    ]);
    prisma.media.count.mockResolvedValue(1);

    const page = await service.listUnverifiedMedia({});

    expect(page.items[0]).not.toHaveProperty('storageKey');
    expect(page.items[0]).not.toHaveProperty('posterKey');
  });
});

describe("listBlockedMedia — the super admin's takedown inventory", () => {
  it('asks for blocked clips only', async () => {
    const { service, prisma } = build();

    await service.listBlockedMedia({});

    expect(prisma.media.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', moderationStatus: 'BLOCKED' },
      }),
    );
  });

  /*
   * The two lists are complements, and a clip must never be in both: the queue is
   * what nobody has judged, this is what somebody judged and refused.
   */
  it('never overlaps the pending queue', async () => {
    const { service, prisma } = build();

    await service.listUnverifiedMedia({});
    await service.listBlockedMedia({});

    const [pending] = prisma.media.findMany.mock.calls[0] as unknown as [
      { where: { moderationStatus: string } },
    ];
    const [blocked] = prisma.media.findMany.mock.calls[1] as unknown as [
      { where: { moderationStatus: string } },
    ];
    expect(pending.where.moderationStatus).toBe('UNVERIFIED');
    expect(blocked.where.moderationStatus).toBe('BLOCKED');
  });

  /*
   * A player's own delete leaves REMOVED with its objects already gone, and a
   * report takedown leaves FLAGGED. Neither is the Block button, and neither has
   * a video left to review — listing them would be rows a super admin cannot act
   * on.
   */
  it('excludes clips that left circulation some other way', async () => {
    const { service, prisma } = build();

    await service.listBlockedMedia({});

    const [call] = prisma.media.findMany.mock.calls[0] as unknown as [
      { where: { status: string } },
    ];
    expect(call.where.status).toBe('ACTIVE');
  });

  it('paginates, because nothing but a permanent delete shortens this list', async () => {
    const { service, prisma } = build();

    await service.listBlockedMedia({ page: 3, pageSize: 10 });

    expect(prisma.media.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it('carries the player and a signed URL, like the pending queue', async () => {
    const { service, prisma } = build({ moderationStatus: 'BLOCKED' });
    prisma.media.findMany.mockResolvedValue([
      {
        ...CLIP,
        moderationStatus: 'BLOCKED',
        createdAt: new Date(),
        player: {
          id: 'player-1',
          firstName: 'John',
          lastName: 'Doe',
          birthDate: new Date('2010-01-01'),
          primaryPosition: 'ST',
          region: 'Tashkent',
          district: 'Yunusabad',
          user: { id: 'user-1', avatarKey: null, username: 'johndoe' },
        },
      },
    ]);
    prisma.media.count.mockResolvedValue(1);

    const page = await service.listBlockedMedia({});

    expect(page.items[0]).toEqual(
      expect.objectContaining({
        id: 'clip-1',
        url: 'https://signed.example/clip',
        player: expect.objectContaining({ firstName: 'John' }),
      }),
    );
    expect(page.items[0]).not.toHaveProperty('storageKey');
    expect(page.total).toBe(1);
  });
});

describe('verifyMedia — the one write that makes a clip public', () => {
  it('moves an unreviewed clip to VERIFIED', async () => {
    const { service, prisma } = build();

    await service.verifyMedia('admin-1', 'clip-1');

    expect(prisma.media.updateMany).toHaveBeenCalledWith({
      where: { id: 'clip-1', moderationStatus: 'UNVERIFIED' },
      data: { moderationStatus: 'VERIFIED' },
    });
  });

  it('records the transition, both ends of it, against the moderator', async () => {
    const { service, audit } = build();

    await service.verifyMedia('admin-1', 'clip-1');

    expect(audit.record).toHaveBeenCalledWith('admin-1', AuditAction.MEDIA_VERIFIED, {
      mediaId: 'clip-1',
      playerId: 'player-1',
      previousStatus: 'UNVERIFIED',
      newStatus: 'VERIFIED',
    });
  });

  /*
   * The public profile read is cached for five minutes and embeds the player's
   * verified clips. Without this the approved clip is invisible on the profile
   * for up to five minutes after the button was pressed — which reads as the
   * button not having worked.
   */
  it('clears the cached public profile, so the clip appears at once', async () => {
    const { service, redis } = build();

    await service.verifyMedia('admin-1', 'clip-1');

    expect(redis.del).toHaveBeenCalledWith('player:profile:player-1');
  });

  it('404s on a clip that does not exist', async () => {
    const { service, prisma } = build();
    prisma.media.findUnique.mockResolvedValue(null);

    await expect(service.verifyMedia('admin-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('blockMedia — a decision, not a delete', () => {
  it('moves an unreviewed clip to BLOCKED', async () => {
    const { service, prisma } = build();

    await service.blockMedia('admin-1', 'clip-1');

    expect(prisma.media.updateMany).toHaveBeenCalledWith({
      where: { id: 'clip-1', moderationStatus: 'UNVERIFIED' },
      data: { moderationStatus: 'BLOCKED' },
    });
  });

  /* The row survives so the moderation record does. This is the whole difference
     between Block and the super admin's Delete. */
  it('does not delete the row or its files', async () => {
    const { service, prisma, storage } = build();

    await service.blockMedia('admin-1', 'clip-1');

    expect(prisma.media.delete).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('clears the cached profile, so the clip leaves it immediately', async () => {
    const { service, redis } = build();

    await service.blockMedia('admin-1', 'clip-1');

    expect(redis.del).toHaveBeenCalledWith('player:profile:player-1');
  });
});

describe('two admins, one clip', () => {
  it('refuses to block what has already been verified, and says so', async () => {
    const { service, prisma } = build({ moderationStatus: 'VERIFIED' });

    await expect(service.blockMedia('admin-b', 'clip-1')).rejects.toThrow(/already been verified/);
    expect(prisma.media.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to verify what has already been blocked', async () => {
    const { service } = build({ moderationStatus: 'BLOCKED' });

    await expect(service.verifyMedia('admin-b', 'clip-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  /*
   * The read and the write are two statements, so the decision can change between
   * them. The `where` on `updateMany` is what closes that window: a zero-row
   * result means somebody else's decision landed in between, and the loser is
   * told rather than silently doing nothing.
   */
  it('refuses when the decision changes between the read and the write', async () => {
    const { service, prisma, audit } = build();
    prisma.media.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.verifyMedia('admin-b', 'clip-1')).rejects.toThrow(/Another moderator/);
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('deleteMedia — the super admin destroys a clip', () => {
  it('removes the row and then both objects, in that order', async () => {
    const { service, prisma, storage } = build();

    await service.deleteMedia('super-1', 'clip-1');

    expect(prisma.media.delete).toHaveBeenCalledWith({ where: { id: 'clip-1' } });
    expect(storage.deleteObject).toHaveBeenCalledWith(CLIP.storageKey);
    expect(storage.deleteObject).toHaveBeenCalledWith(CLIP.posterKey);
  });

  it('records the destruction and what state the clip was in', async () => {
    const { service, audit } = build({ moderationStatus: 'BLOCKED' });

    await service.deleteMedia('super-1', 'clip-1');

    expect(audit.record).toHaveBeenCalledWith('super-1', AuditAction.MEDIA_DELETED, {
      mediaId: 'clip-1',
      playerId: 'player-1',
      previousStatus: 'BLOCKED',
    });
  });

  /*
   * The clip is already gone from the platform by the time the bucket is touched.
   * Throwing here would report failure for work that succeeded and invite a retry
   * with nothing left to delete; the key is logged instead so the orphan is
   * findable. Same rule as MediaService.remove.
   */
  it('survives a bucket that refuses the delete', async () => {
    const { service, storage } = build();
    storage.deleteObject.mockRejectedValue(new Error('R2 unreachable'));

    await expect(service.deleteMedia('super-1', 'clip-1')).resolves.toEqual({
      deleted: true,
      mediaId: 'clip-1',
    });
  });

  it('404s rather than auditing a delete of nothing', async () => {
    const { service, prisma, audit } = build();
    prisma.media.findUnique.mockResolvedValue(null);

    await expect(service.deleteMedia('super-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.media.delete).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
