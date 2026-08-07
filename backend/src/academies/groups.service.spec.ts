import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import type { AuditService } from '../audit/audit.service';

/**
 * The rule under test is TRIAL.md Rule 21 / README §1.9:
 *
 * > A coach may assess a player's attributes **if and only if** the coach and
 * > the player share a group inside the same academy squad.
 *
 * Both halves matter, and the "only if" half is the one with teeth: holding the
 * coach role, or reviewing the player online, or running the trial they turned
 * up to, buys nothing. This is the check every attribute write goes through, so
 * a hole here is a hole in the one number a player cannot write about
 * themselves (§12.4).
 */

const PLAYER = { id: 'player-1', userId: 'player-user-1' };

function build() {
  const prisma = {
    playerProfile: { findUnique: jest.fn(async (): Promise<unknown> => PLAYER) },
    academyMember: {
      findMany: jest.fn(async (): Promise<unknown> => [{ groupId: 'group-1' }]),
      findFirst: jest.fn(async (): Promise<unknown> => ({ id: 'member-1' })),
    },
  };

  const service = new GroupsService(
    prisma as unknown as PrismaService,
    {} as unknown as StorageService,
    {} as unknown as AuditService,
  );

  return { service, prisma };
}

describe('GroupsService.assertCoachesPlayer — who may score a player (Rule 21)', () => {
  it('allows a coach who shares the player’s group', async () => {
    const { service } = build();

    await expect(service.assertCoachesPlayer('coach-1', PLAYER.id)).resolves.toBeUndefined();
  });

  it('looks the player up only among the coach’s own groups', async () => {
    const { service, prisma } = build();
    prisma.academyMember.findMany.mockResolvedValue([{ groupId: 'group-1' }, { groupId: 'g-2' }]);

    await service.assertCoachesPlayer('coach-1', PLAYER.id);

    expect(prisma.academyMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: PLAYER.userId,
          role: 'PLAYER',
          status: 'ACTIVE',
          groupId: { in: ['group-1', 'g-2'] },
        }),
      }),
    );
  });

  it('refuses a coach with no group of their own', async () => {
    const { service, prisma } = build();
    prisma.academyMember.findMany.mockResolvedValue([]);

    await expect(service.assertCoachesPlayer('coach-1', PLAYER.id)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('never asks the database when the coach has no groups — an empty `in` matches rows', async () => {
    const { service, prisma } = build();
    prisma.academyMember.findMany.mockResolvedValue([]);

    await expect(service.assertCoachesPlayer('coach-1', PLAYER.id)).rejects.toThrow();

    // `groupId: { in: [] }` is not a safe query to lean on, and a coach in the
    // reserve must not be one edge case away from scoring the whole academy.
    expect(prisma.academyMember.findFirst).not.toHaveBeenCalled();
  });

  it('refuses when the player is in none of the coach’s groups', async () => {
    const { service, prisma } = build();
    prisma.academyMember.findFirst.mockResolvedValue(null);

    await expect(service.assertCoachesPlayer('coach-1', PLAYER.id)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses a player in the reserve — the reserve is the absence of a group (Rule 23)', async () => {
    const { service, prisma } = build();
    // The player holds a membership, but with `groupId = null` they match no
    // `{ in: [...] }` the coach could offer.
    prisma.academyMember.findFirst.mockResolvedValue(null);

    await expect(service.assertCoachesPlayer('coach-1', PLAYER.id)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('says the player does not exist rather than that the coach may not score them', async () => {
    const { service, prisma } = build();
    prisma.playerProfile.findUnique.mockResolvedValue(null);

    await expect(service.assertCoachesPlayer('coach-1', 'nobody')).rejects.toThrow(
      NotFoundException,
    );
  });
});
