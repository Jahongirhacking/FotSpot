import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { StorageService } from '../storage/storage.service';
import { EmailService } from '../email/email.service';
import { avatarKey } from '../storage/storage.keys';

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
