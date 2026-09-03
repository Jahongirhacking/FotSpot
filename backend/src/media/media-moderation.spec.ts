import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { TelegramAdminAlertsService } from '../telegram/telegram-admin-alerts.service';
import type { MediaModerationStatus, MediaStatus } from '@prisma/client';
import { MediaService, toMediaResponse } from './media.service';
import type { MediaFinaliserService } from './media-finaliser.service';
import type { GroupsService } from '../academies/groups.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { StorageService } from '../storage/storage.service';
import type { TariffsService } from '../tariffs/tariffs.service';

/**
 * The user-facing half of video moderation, from the read side.
 *
 * Every test here is one sentence of the spec's visibility table: which clip a
 * given caller gets back, and what happens when they name an id they were never
 * shown. The reads are asserted on the `where` the service hands Prisma rather
 * than on a filtered result — filtering after the fact is the exact failure mode
 * §12 forbids, and a test that only checked the returned array would pass for
 * both implementations.
 */

const OWNER_USER = 'player-user-1';
const PLAYER_ID = 'player-1';

const CLIP: {
  id: string;
  playerId: string;
  category: string;
  status: MediaStatus;
  moderationStatus: MediaModerationStatus;
  storageKey: string;
  posterKey: string | null;
  rating: number | null;
  reportedBy: 'SELF' | 'COACH';
} = {
  id: 'clip-1',
  playerId: PLAYER_ID,
  category: 'PACE',
  status: 'ACTIVE',
  moderationStatus: 'UNVERIFIED',
  storageKey: `private/players/${PLAYER_ID}/clip.mp4`,
  posterKey: null,
  rating: 70,
  reportedBy: 'SELF',
};

/**
 * The fake resolves ownership from the caller's user id, exactly as the service
 * does — never from a flag the test hands it.
 *
 * That distinction is the whole subject of these tests. A fake that took an
 * "is the owner" boolean would let "the owner sees their clip" and "a stranger
 * does not" both pass against an implementation that trusted a request
 * parameter, which is the security bug this design exists to make impossible.
 * Here the only way to be the owner is to *be* `OWNER_USER`.
 */
function build(clip: Partial<typeof CLIP> = {}) {
  const row = { ...CLIP, ...clip };
  const profileOf = (userId?: string) =>
    userId === OWNER_USER ? { id: PLAYER_ID, userId: OWNER_USER } : null;

  const prisma = {
    media: {
      findUnique: jest.fn(async (): Promise<unknown> => row),
      findMany: jest.fn(async (): Promise<unknown> => []),
      count: jest.fn(async () => 0),
      create: jest.fn(async (): Promise<unknown> => ({ ...row, moderationStatus: 'UNVERIFIED' })),
      update: jest.fn(async (): Promise<unknown> => row),
    },
    mediaLike: { upsert: jest.fn(async () => ({})), count: jest.fn(async () => 0) },
    mediaView: { create: jest.fn(async () => ({})), count: jest.fn(async () => 0) },
    mediaComment: { create: jest.fn(async () => ({})), count: jest.fn(async () => 0) },
    ratingRevision: { findMany: jest.fn(async () => []) },
    coachProfile: {
      findUnique: jest.fn(async (): Promise<unknown> => ({ id: 'coach-1', status: 'VERIFIED' })),
    },
    playerProfile: {
      // `ownPlayerId` — which player profile does this account own, if any.
      findUnique: jest.fn(async ({ where }: { where: { userId?: string } }): Promise<unknown> =>
        profileOf(where.userId),
      ),
      // `listForPlayer`'s probe — is this account the player being asked about.
      findFirst: jest.fn(
        async ({ where }: { where: { id?: string; userId?: string } }): Promise<unknown> =>
          where.userId === OWNER_USER && where.id === PLAYER_ID ? { id: PLAYER_ID } : null,
      ),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  const storage = {
    readUrlOrNull: jest.fn(async () => 'https://signed.example/clip'),
    publicUrlOrNull: jest.fn(() => null),
    createUploadUrl: jest.fn(async (storageKey: string) => ({
      uploadUrl: 'https://upload.example',
      storageKey,
    })),
    deleteObject: jest.fn(async () => undefined),
  };

  const service = new MediaService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
    { del: jest.fn(async () => undefined), wrap: jest.fn() } as unknown as RedisService,
    { assertCoachesPlayer: jest.fn(async () => undefined) } as unknown as GroupsService,
    {
      assertCanUploadClip: jest.fn(async () => undefined),
      clipQuota: jest.fn(async () => ({ used: 0, limit: 10, exceeded: false })),
    } as unknown as TariffsService,
    { add: jest.fn(async () => ({})) } as unknown as Queue,
    {} as unknown as MediaFinaliserService,
    // Only reached from confirmUpload for a VIDEO; inert here.
    { announce: jest.fn(async () => undefined) } as unknown as TelegramAdminAlertsService,
  );

  return { service, prisma, storage };
}

describe('upload — a clip cannot be born public', () => {
  /*
   * The primary invariant of the whole feature. `moderationStatus` is absent from
   * the create, so the column default (UNVERIFIED) is what lands — and the upload
   * path has no way to say otherwise even if a future DTO grew a field for it.
   */
  it('never writes a moderation status when recording an upload', async () => {
    const { service, prisma } = build();

    await service.confirmUpload(OWNER_USER, {
      type: 'VIDEO',
      category: 'PACE',
      storageKey: `private/players/${PLAYER_ID}/clip.mp4`,
      rating: 70,
    } as never);

    const [written] = prisma.media.create.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ];
    expect(written.data).not.toHaveProperty('moderationStatus');
  });
});

describe('the signed URL a clip is served with', () => {
  /*
   * Blocking has to take effect when it is pressed, not when a signature lapses.
   * A verified clip's URL is signed for the seven-day maximum and re-minted on
   * every read; an unreviewed one is signed for minutes, because the only people
   * holding one are its uploader and the admin who may be about to block it.
   */
  it('gives an unreviewed clip a short-lived signature', async () => {
    const { storage } = build();

    const signed = await toMediaResponse(
      { ...CLIP, moderationStatus: 'UNVERIFIED' },
      storage as unknown as StorageService,
    );

    expect(signed.url).toBe('https://signed.example/clip');
    expect(storage.readUrlOrNull).toHaveBeenCalledWith(CLIP.storageKey, 15 * 60);
  });

  it('gives a blocked clip the same short signature', async () => {
    const { storage } = build();

    await toMediaResponse(
      { ...CLIP, moderationStatus: 'BLOCKED' },
      storage as unknown as StorageService,
    );

    expect(storage.readUrlOrNull).toHaveBeenCalledWith(CLIP.storageKey, 15 * 60);
  });

  it('leaves a verified clip on the default long-lived signature', async () => {
    const { storage } = build();

    await toMediaResponse(
      { ...CLIP, moderationStatus: 'VERIFIED' },
      storage as unknown as StorageService,
    );

    expect(storage.readUrlOrNull).toHaveBeenCalledWith(CLIP.storageKey, undefined);
  });

  /* The feed's raw SQL does not select the column, and its WHERE already demands
     VERIFIED — so an absent status must take the long TTL, not the short one. */
  it('treats an unselected status as verified rather than guessing', async () => {
    const { storage } = build();

    await toMediaResponse(
      { storageKey: CLIP.storageKey, posterKey: null },
      storage as unknown as StorageService,
    );

    expect(storage.readUrlOrNull).toHaveBeenCalledWith(CLIP.storageKey, undefined);
  });
});

describe('a player profile — who is asking decides what comes back', () => {
  it('serves a visitor verified clips only', async () => {
    const { service, prisma } = build();

    await service.listForPlayer(PLAYER_ID, {}, undefined);

    expect(prisma.media.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE', moderationStatus: 'VERIFIED' }),
      }),
    );
  });

  it('serves another signed-in user verified clips only', async () => {
    const { service, prisma } = build();

    await service.listForPlayer(PLAYER_ID, {}, 'scout-user-1');

    expect(prisma.media.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ moderationStatus: 'VERIFIED' }),
      }),
    );
  });

  /*
   * The owner's own clips at every moderation stage — waiting, live and blocked.
   * A player who cannot see their own upload cannot tell "in review" from "the
   * upload failed", and the second reading is the one that makes them upload it
   * again.
   */
  it('serves the owner their own clips whatever the moderator has decided', async () => {
    const { service, prisma } = build();

    await service.listForPlayer(PLAYER_ID, {}, OWNER_USER);

    const [call] = prisma.media.findMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(call.where).not.toHaveProperty('moderationStatus');
    expect(call.where.status).toEqual({ in: ['ACTIVE', 'PROCESSING', 'FAILED'] });
  });
});

describe('the public strip on the landing page', () => {
  it('asks for verified clips only', async () => {
    const { service, prisma } = build();

    await service.listRecent(8);

    expect(prisma.media.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE', moderationStatus: 'VERIFIED' }),
      }),
    );
  });
});

describe('the ranked feed', () => {
  /*
   * The feed is raw SQL — the ordering *is* a computed score over four tables, so
   * it cannot be a Prisma `where`. That makes it the one query where the filter
   * could be forgotten without any type error, which is why it is asserted on the
   * statement text itself.
   */
  it('demands both ACTIVE and VERIFIED in the SQL', async () => {
    const { service, prisma } = build();
    const queryRaw = jest.fn(async () => []);
    (prisma as Record<string, unknown>).$queryRaw = queryRaw;

    await service.feed('scout-user-1', { page: 1, pageSize: 6 });

    const [statement] = queryRaw.mock.calls[0] as unknown as [{ strings: string[] }];
    const sql = statement.strings.join('?');
    expect(sql).toContain("m.status = 'ACTIVE'");
    expect(sql).toContain(`m."moderationStatus" = 'VERIFIED'`);
  });

  it('counts the same population it lists', async () => {
    const { service, prisma } = build();
    (prisma as Record<string, unknown>).$queryRaw = jest.fn(async () => []);

    await service.feed('scout-user-1', {});

    expect(prisma.media.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: 'ACTIVE', moderationStatus: 'VERIFIED' }),
    });
  });
});

describe('interacting with a clip you were never shown', () => {
  /*
   * Hiding a clip from the feed is not the property being defended. Every one of
   * these endpoints takes an id, and an id is guessable — so each is its own
   * front door and each is checked.
   */
  // UNVERIFIED is "nobody has watched it yet"; BLOCKED is "somebody watched it
  // and said no". Different reasons, identical consequences for everyone who is
  // not the uploader — which is what makes them one table.
  describe.each(['UNVERIFIED', 'BLOCKED'] as const)('a clip that is %s', (moderationStatus) => {
    it('cannot be liked', async () => {
      const { service } = build({ moderationStatus });

      await expect(service.like('scout-user-1', CLIP.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cannot be commented on', async () => {
      const { service } = build({ moderationStatus });

      await expect(
        service.comment('scout-user-1', CLIP.id, { body: 'nice' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not accept a view', async () => {
      const { service, prisma } = build({ moderationStatus });

      await expect(service.recordView(CLIP.id, { userId: 'scout-user-1' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.mediaView.create).not.toHaveBeenCalled();
    });

    it('does not report its engagement to a stranger', async () => {
      const { service } = build({ moderationStatus });

      await expect(service.getEngagement(CLIP.id, 'scout-user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('does not report its engagement to a guest', async () => {
      const { service } = build({ moderationStatus });

      await expect(service.getEngagement(CLIP.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not list its comments', async () => {
      const { service } = build({ moderationStatus });

      await expect(service.listComments(CLIP.id, {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not hand over its rating history', async () => {
      const { service } = build({ moderationStatus });

      await expect(service.ratingHistory(CLIP.id, 'scout-user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    /* A coach is one of the roles §9 says must never be served an unreviewed
       clip, so rating one is judging footage nobody has cleared. */
    it('cannot be rated by a coach', async () => {
      const { service } = build({ moderationStatus });

      await expect(
        service.rate('coach-user-1', CLIP.id, { rating: 90 } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('is all allowed again once the clip is verified', async () => {
    const { service } = build({ moderationStatus: 'VERIFIED' });

    await expect(service.like('scout-user-1', CLIP.id)).resolves.toBeDefined();
    await expect(service.recordView(CLIP.id, { userId: 'scout-user-1' })).resolves.toEqual({
      recorded: true,
    });
    await expect(service.getEngagement(CLIP.id, 'scout-user-1')).resolves.toEqual(
      expect.objectContaining({ mediaId: CLIP.id }),
    );
  });
});

describe('the owner and their own unreviewed clip — the full read chain', () => {
  /*
   * These are the acceptance tests for the regression that "waiting for
   * verification" replaced the video instead of labelling it.
   *
   * UNVERIFIED does not mean invisible to its owner. It means invisible to
   * everyone *except* its owner and the moderators, and the owner has to get the
   * row, the poster, the playable URL and the badge — every link in the chain,
   * not just the first.
   */

  it('returns the row to its owner', async () => {
    const { service, prisma } = build({ moderationStatus: 'UNVERIFIED' });
    prisma.media.findMany.mockResolvedValue([{ ...CLIP, moderationStatus: 'UNVERIFIED' }]);
    prisma.media.count.mockResolvedValue(1);

    const page = await service.listForPlayer(PLAYER_ID, {}, OWNER_USER);

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toEqual(expect.objectContaining({ id: CLIP.id }));
  });

  /* The poster is what the grid draws. Withholding it is what produced a grey
     tile with a badge and no picture. */
  it('gives its owner a playable URL and a poster URL', async () => {
    const { service, prisma } = build({ moderationStatus: 'UNVERIFIED' });
    prisma.media.findMany.mockResolvedValue([
      { ...CLIP, moderationStatus: 'UNVERIFIED', posterKey: 'private/players/player-1/poster.jpg' },
    ]);
    prisma.media.count.mockResolvedValue(1);

    const page = await service.listForPlayer(PLAYER_ID, {}, OWNER_USER);

    expect(page.items[0].url).toBe('https://signed.example/clip');
    expect(page.items[0].posterUrl).toBe('https://signed.example/clip');
  });

  it('carries the moderation status, so the card can badge it', async () => {
    const { service, prisma } = build({ moderationStatus: 'UNVERIFIED' });
    prisma.media.findMany.mockResolvedValue([{ ...CLIP, moderationStatus: 'UNVERIFIED' }]);
    prisma.media.count.mockResolvedValue(1);

    const page = await service.listForPlayer(PLAYER_ID, {}, OWNER_USER);

    expect(page.items[0].moderationStatus).toBe('UNVERIFIED');
  });

  /*
   * The other half of the same coin, and the one that matters for safety: the
   * row must never be in Player B's response at all. Not returned-and-hidden —
   * absent, because the query never asked for it.
   */
  it('does not return it to another player, who gets the public query', async () => {
    const { service, prisma } = build({ moderationStatus: 'UNVERIFIED' });

    await service.listForPlayer(PLAYER_ID, {}, 'other-player-user');

    const [call] = prisma.media.findMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(call.where).toEqual(
      expect.objectContaining({ status: 'ACTIVE', moderationStatus: 'VERIFIED' }),
    );
  });

  it('does not return it to a signed-out visitor', async () => {
    const { service, prisma } = build({ moderationStatus: 'UNVERIFIED' });

    await service.listForPlayer(PLAYER_ID, {}, undefined);

    const [call] = prisma.media.findMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(call.where).toEqual(
      expect.objectContaining({ status: 'ACTIVE', moderationStatus: 'VERIFIED' }),
    );
  });

  /* Ownership comes from the authenticated user id and nothing else — there is
     no argument through which a caller could claim it. */
  it('resolves ownership from the authenticated user, not from the request', async () => {
    const { service, prisma } = build({ moderationStatus: 'UNVERIFIED' });

    await service.getEngagement(CLIP.id, OWNER_USER);

    expect(prisma.playerProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: OWNER_USER } }),
    );
  });
});

describe('the owner and their own pending clip', () => {
  /*
   * Deliberately not a hole. The counts are all zero while a clip is unreviewed —
   * nothing else can reach it to like or watch it — and the player's clip panel
   * asks for engagement the moment a clip opens. A 404 on their own upload reads
   * as "your video is broken", which is the opposite of "waiting for review".
   */
  it('is given the engagement counts on their own unverified clip', async () => {
    const { service } = build({ moderationStatus: 'UNVERIFIED' });

    await expect(service.getEngagement(CLIP.id, OWNER_USER)).resolves.toEqual(
      expect.objectContaining({ mediaId: CLIP.id, likes: 0, views: 0 }),
    );
  });

  it('can read the rating history of their own unverified clip', async () => {
    const { service } = build({ moderationStatus: 'UNVERIFIED' });

    await expect(service.ratingHistory(CLIP.id, OWNER_USER)).resolves.toEqual([]);
  });

  /* A blocked clip is a moderation decision, not a draft. The only thing its
     owner can usefully do with it now is delete it. */
  it('cannot retitle a clip a moderator blocked', async () => {
    const { service } = build({ moderationStatus: 'BLOCKED' });

    await expect(
      service.update(OWNER_USER, CLIP.id, { title: 'try again' } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('can still edit a clip that is merely waiting for review', async () => {
    const { service } = build({ moderationStatus: 'UNVERIFIED' });

    await expect(
      service.update(OWNER_USER, CLIP.id, { title: 'my sprint' } as never),
    ).resolves.toBeDefined();
  });

  it('can delete their own blocked clip', async () => {
    const { service } = build({ moderationStatus: 'BLOCKED' });

    await expect(service.remove(OWNER_USER, CLIP.id)).resolves.toBeDefined();
  });
});
