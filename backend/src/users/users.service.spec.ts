import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { StorageService } from '../storage/storage.service';
import { EmailService } from '../email/email.service';
import { avatarKey } from '../storage/storage.keys';
import type { RedisService } from '../redis/redis.service';
import { OWN_MEDIA_WHERE } from '../media/media-visibility.util';

const USER_ID = '77588691-7f87-412a-a738-53a1138728aa';

/**
 * Only what `updateProfile` touches. A fuller fake would be a second, wronger
 * copy of Prisma to maintain — these tests are about which object gets deleted
 * and when, not about the ORM.
 */
function harness(options: { storedAvatarKey?: string | null; deleteRejects?: Error } = {}) {
  const deleted: string[] = [];
  let stored = options.storedAvatarKey ?? null;
  const findUnique = jest.fn(async () => ({ avatarKey: stored }));

  const prisma = {
    user: {
      findUnique,
      update: jest.fn(async ({ data }: { data: { avatarKey?: string } }) => {
        if (data.avatarKey !== undefined) stored = data.avatarKey;
        return {
          id: USER_ID,
          firstName: 'A',
          lastName: 'B',
          username: 'ab',
          avatarKey: stored,
          isPrivate: false,
        };
      }),
    },
    /*
     * The account is the source of truth for a name, and `updateProfile` pushes
     * a rename down to the player card so the two cannot diverge. These tests
     * are about avatars, so the card is absent — which is also the ordinary
     * case, since most accounts are not players.
     */
    playerProfile: {
      updateMany: jest.fn(async () => ({ count: 0 })),
      findUnique: jest.fn(async () => null),
    },
  } as unknown as PrismaService;

  const storage = {
    publicUrlOrNull: (key: string | null) => (key ? `https://cdn.example/${key}` : null),
    deleteObject: jest.fn(async (key: string) => {
      if (options.deleteRejects) throw options.deleteRejects;
      deleted.push(key);
    }),
  } as unknown as StorageService;

  const service = new UsersService(
    prisma,
    {} as RbacService,
    storage,
    { get: () => undefined } as unknown as ConfigService,
    // Not exercised by these tests — they are about which avatar object is
    // deleted, and nothing in that path sends mail.
    {} as unknown as EmailService,
    // Only reached when a name changes, which these tests never do. `del` is a
    // no-op rather than absent so a future test that does change one fails on
    // the assertion instead of on a missing method.
    { del: jest.fn(async () => undefined) } as unknown as RedisService,
  );

  return { service, storage, prisma, deleted, findUnique };
}

describe('UsersService.updateProfile — one avatar at a time', () => {
  it('deletes the object the previous avatar pointed at', async () => {
    const previous = avatarKey(USER_ID, 'old.jpg');
    const next = avatarKey(USER_ID, 'new.jpg');
    const { service, deleted } = harness({ storedAvatarKey: previous });

    const result = await service.updateProfile(USER_ID, { avatarStorageKey: next });

    expect(deleted).toEqual([previous]);
    expect(result.avatarUrl).toBe(`https://cdn.example/${next}`);
  });

  it('deletes nothing on the first avatar, when there is no previous one', async () => {
    const { service, storage } = harness({ storedAvatarKey: null });

    await service.updateProfile(USER_ID, { avatarStorageKey: avatarKey(USER_ID, 'first.jpg') });

    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('does not delete the avatar it is being asked to keep', async () => {
    // A client that re-confirms the same key — a retry, a double submit — must not
    // delete the object it just named, which would leave the row pointing at
    // nothing.
    const same = avatarKey(USER_ID, 'same.jpg');
    const { service, storage } = harness({ storedAvatarKey: same });

    await service.updateProfile(USER_ID, { avatarStorageKey: same });

    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('leaves the avatar alone when the edit is about something else', async () => {
    const { service, storage, findUnique } = harness({
      storedAvatarKey: avatarKey(USER_ID, 'kept.jpg'),
    });

    await service.updateProfile(USER_ID, { firstName: 'Renamed' });

    expect(storage.deleteObject).not.toHaveBeenCalled();
    // And does not pay for the lookup either.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('still succeeds when the old object cannot be deleted', async () => {
    // The avatar has already changed by this point. Reporting failure would deny
    // a change that happened, and the retry it invites uploads a second new
    // object — answering one orphan with another.
    const { service } = harness({
      storedAvatarKey: avatarKey(USER_ID, 'old.jpg'),
      deleteRejects: new Error('R2 unreachable'),
    });

    const next = avatarKey(USER_ID, 'new.jpg');
    await expect(service.updateProfile(USER_ID, { avatarStorageKey: next })).resolves.toMatchObject(
      { avatarUrl: `https://cdn.example/${next}` },
    );
  });

  it('refuses to delete a stored key outside the account’s own directory', async () => {
    // Unreachable through this service today, since the same method checks the
    // prefix before storing. It is here because the operation is a delete, and a
    // row that somehow holds someone else's key should cost a log line rather
    // than their object.
    const someoneElse = avatarKey('11111111-2222-3333-4444-555555555555', 'theirs.jpg');
    const { service, storage } = harness({ storedAvatarKey: someoneElse });

    await service.updateProfile(USER_ID, { avatarStorageKey: avatarKey(USER_ID, 'mine.jpg') });

    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* The clip count on the profile card                                         */
/* -------------------------------------------------------------------------- */

/**
 * Enough of Prisma for `findMeWithStats`, and no more.
 *
 * It records the `select` the player query was given, because that is where the
 * bug lived: the count itself was always correct about what it was asked for.
 */
function statsHarness(mediaCount: number) {
  const playerFindUnique = jest.fn(async () => ({
    id: 'player-1',
    birthDate: null,
    primaryPosition: 'RW',
    secondaryPosition: null,
    dominantFoot: 'RIGHT',
    playingStyle: null,
    region: null,
    district: null,
    height: null,
    weight: null,
    _count: { media: mediaCount, trialApplications: 0, recommendations: 0 },
  }));

  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({
        id: USER_ID,
        email: 'a@b.c',
        phone: null,
        username: 'already-has-one',
        firstName: 'A',
        lastName: 'B',
        avatarKey: null,
        mustChangePassword: false,
        isPrivate: false,
        createdAt: new Date(),
      })),
    },
    playerProfile: { findUnique: playerFindUnique },
    coachProfile: { findUnique: jest.fn(async () => null) },
    scoutStats: { findUnique: jest.fn(async () => null) },
    academyMember: { findMany: jest.fn(async () => []) },
    follow: { count: jest.fn(async () => 0) },
    academyScoutFollow: { count: jest.fn(async () => 0) },
  } as unknown as PrismaService;

  const service = new UsersService(
    prisma,
    // `findMe` attaches roles and permissions to the response; these tests are
    // about the clip count, so an empty grant is the least it can return.
    { getEffectiveAccess: jest.fn(async () => ({ roles: [], permissions: [] })) } as unknown as RbacService,
    { publicUrlOrNull: () => null } as unknown as StorageService,
    { get: () => undefined } as unknown as ConfigService,
    {} as unknown as EmailService,
    { del: jest.fn(async () => undefined) } as unknown as RedisService,
  );

  return { service, playerFindUnique };
}

describe('the profile clip count', () => {
  /**
   * The regression, stated as the query rather than as the number.
   *
   * Deleting a clip is a soft delete — `MediaService.remove` writes
   * `status: 'REMOVED'` so the rating history, the likes and the moderation
   * trail outlive the object. An unfiltered `_count` therefore kept counting
   * clips that no longer exist, and a player who uploaded three and deleted all
   * three still read "3".
   */
  it('counts only the clips that still exist', async () => {
    const { service, playerFindUnique } = statsHarness(2);

    await service.findMeWithStats(USER_ID);

    const select = (playerFindUnique.mock.calls[0] as unknown as [{ select: Record<string, any> }])[0]
      .select;
    expect(select._count.select.media).toEqual({ where: OWN_MEDIA_WHERE });
  });

  /* `true` is the shape of the bug: count every row, whatever its status. */
  it('does not ask for an unfiltered count', async () => {
    const { service, playerFindUnique } = statsHarness(2);

    await service.findMeWithStats(USER_ID);

    const select = (playerFindUnique.mock.calls[0] as unknown as [{ select: Record<string, any> }])[0]
      .select;
    expect(select._count.select.media).not.toBe(true);
  });

  /*
   * The filter it reuses must actually exclude a deleted clip. Asserted here as
   * well as in media-visibility.util.spec.ts, because this is the property the
   * profile card depends on and a change to the constant should fail *here*
   * too — the two files are otherwise free to drift.
   */
  it('uses a filter that excludes a removed clip', () => {
    expect(OWN_MEDIA_WHERE.status.in).not.toContain('REMOVED');
    expect(OWN_MEDIA_WHERE.status.in).toContain('ACTIVE');
  });

  it('reports the filtered count as mediaCount', async () => {
    const { service } = statsHarness(2);

    const result = await service.findMeWithStats(USER_ID);

    expect(result.stats.player?.mediaCount).toBe(2);
  });

  /* Every clip deleted is zero, not the number once uploaded. */
  it('reports zero once every clip has been deleted', async () => {
    const { service } = statsHarness(0);

    const result = await service.findMeWithStats(USER_ID);

    expect(result.stats.player?.mediaCount).toBe(0);
  });
});
