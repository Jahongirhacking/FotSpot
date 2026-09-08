import { ForbiddenException } from '@nestjs/common';
import { TrialsService } from './trials.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';

/**
 * What a coach is shown of a private trial, and what they are not.
 *
 * Two leaks this pins shut (TRIAL.md §11, §29): a coach was handed the invited
 * player before the player had agreed to come, and the trial carried the
 * manager's note to the family — where to come, who to ask for, a phone
 * number — to whoever could open it. The rule is enforced in the queries, not
 * by a screen deciding what to draw.
 */

const TRIAL = {
  id: 'trial-1',
  academyId: 'academy-1',
  type: 'PRIVATE',
  title: 'Private trial — A. Player',
  note: '<p>Ask for Bobur at the gate, +998 90 000 00 00</p>',
  requirements: 'Boots',
  coverKey: null,
};

const row = (status: string, extra: Record<string, unknown> = {}) => ({
  id: `app-${status}`,
  trialId: 'trial-1',
  playerId: 'player-1',
  status,
  inviteNote: '<p>Ask for Bobur at the gate</p>',
  player: { id: 'player-1', firstName: 'A', lastName: 'Player', user: { avatarKey: null } },
  result: null,
  ...extra,
});

function build(viewer: 'MANAGER' | 'COACH' | 'NOBODY', applications: unknown[] = []) {
  const prisma = {
    trial: { findUnique: jest.fn(async () => TRIAL) },
    academyMember: {
      findUnique: jest.fn(async (): Promise<unknown> =>
        viewer === 'MANAGER' ? { role: 'MANAGER' } : null,
      ),
      findFirst: jest.fn(async (): Promise<unknown> =>
        viewer === 'MANAGER' ? { id: 'member-1' } : null,
      ),
    },
    trialCoach: {
      findUnique: jest.fn(async (): Promise<unknown> =>
        viewer === 'COACH' ? { trialId: 'trial-1', coachUserId: 'coach-1' } : null,
      ),
      findFirst: jest.fn(async (): Promise<unknown> =>
        viewer === 'COACH' ? { trialId: 'trial-1', coachUserId: 'coach-1' } : null,
      ),
    },
    trialApplication: {
      findMany: jest.fn(async (args: { where: { status?: { in: string[] } } }) => {
        const allowed = args.where.status?.in;
        return applications.filter(
          (a) => !allowed || allowed.includes((a as { status: string }).status),
        );
      }),
      count: jest.fn(
        async () =>
          applications.filter((a) => (a as { status: string }).status === 'INVITED').length,
      ),
      // `getVisibleById` asks whether the viewer is the player; never here.
      findFirst: jest.fn(async (): Promise<unknown> => null),
    },
  };

  const service = Object.create(TrialsService.prototype) as TrialsService;
  const wired = service as unknown as { prisma: PrismaService; storage: StorageService };
  wired.prisma = prisma as unknown as PrismaService;
  wired.storage = { publicUrlOrNull: () => null } as never;
  return { service, prisma };
}

describe('listApplicationsForTrial — what a coach is handed', () => {
  const rows = [row('INVITED'), row('CONFIRMED'), row('PASSED'), row('REJECTED')];

  it('gives the manager every row, including unanswered invitations', async () => {
    const { service } = build('MANAGER', rows);

    const { items } = await service.listApplicationsForTrial('manager-1', 'trial-1');

    expect(items.map((item) => item.status)).toEqual([
      'INVITED',
      'CONFIRMED',
      'PASSED',
      'REJECTED',
    ]);
  });

  /* The bug: the coach saw the invited player before the player had said yes. */
  it('gives a coach only the participants — never an unanswered invitation', async () => {
    const { service, prisma } = build('COACH', rows);

    const { items } = await service.listApplicationsForTrial('coach-1', 'trial-1');

    expect(items.map((item) => item.status)).toEqual(['CONFIRMED', 'PASSED']);
    // Filtered in the query, not after it.
    const [args] = prisma.trialApplication.findMany.mock.calls[0] as unknown as [
      { where: { status: { in: string[] } } },
    ];
    expect(args.where.status.in).not.toContain('INVITED');
    expect(args.where.status.in).not.toContain('REJECTED');
  });

  it('counts the unanswered invitations for both, without naming anyone', async () => {
    const { service } = build('COACH', rows);

    const { pending } = await service.listApplicationsForTrial('coach-1', 'trial-1');

    expect(pending).toBe(1);
  });

  /* The note is the manager's message to the family. */
  it('keeps the invitation note from a coach and gives it to the manager', async () => {
    const asCoach = await build('COACH', rows).service.listApplicationsForTrial(
      'coach-1',
      'trial-1',
    );
    const asManager = await build('MANAGER', rows).service.listApplicationsForTrial(
      'manager-1',
      'trial-1',
    );

    expect(asCoach.items.every((item) => !('inviteNote' in item))).toBe(true);
    expect(asManager.items[0]).toHaveProperty('inviteNote');
  });

  it('refuses everybody else', async () => {
    const { service } = build('NOBODY', rows);

    await expect(service.listApplicationsForTrial('stranger', 'trial-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('getVisibleById — the note on a private trial', () => {
  it('reaches the manager', async () => {
    const { service } = build('MANAGER');

    const trial = await service.getVisibleById('trial-1', 'manager-1');

    expect(trial.note).toBe(TRIAL.note);
  });

  it('never reaches the assigned coach — the session does, the message does not', async () => {
    const { service } = build('COACH');

    const trial = await service.getVisibleById('trial-1', 'coach-1');

    expect(trial.note).toBeNull();
    expect(trial.title).toBe(TRIAL.title);
    expect(trial.requirements).toBe('Boots');
  });
});
