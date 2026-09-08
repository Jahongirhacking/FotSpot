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
  trial: TRIAL,
  inviteNote: '<p>Ask for Bobur at the gate</p>',
  player: {
    id: 'player-1',
    userId: 'player-user-1',
    firstName: 'A',
    lastName: 'Player',
    user: { avatarKey: null },
  },
  result: null,
  ...extra,
});

type Row = { id: string; status: string };
type Where = {
  trialId?: string;
  status?: string | { in: string[] };
  id?: { in: string[] };
  AND?: Where[];
};

/** The subset of Prisma's `where` the pager uses, evaluated in memory. */
function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  if (where.AND && !where.AND.every((part) => matches(row, part))) return false;
  if (typeof where.status === 'string' && where.status !== row.status) return false;
  if (typeof where.status === 'object' && !where.status.in.includes(row.status)) return false;
  if (where.id && !where.id.in.includes(row.id)) return false;
  return true;
}

function build(
  viewer: 'MANAGER' | 'COACH' | 'NOBODY',
  applications: unknown[] = [],
  squad: { invitation?: { status: string }; member?: boolean } = {},
) {
  const prisma = {
    trial: { findUnique: jest.fn(async () => TRIAL) },
    // The stage after a PASS is read from the squad invitation and the membership.
    academyInvitation: {
      findMany: jest.fn(async (): Promise<unknown[]> =>
        squad.invitation ? [{ userId: 'player-user-1', status: squad.invitation.status }] : [],
      ),
    },
    academyMember: {
      findUnique: jest.fn(async (): Promise<unknown> =>
        viewer === 'MANAGER' ? { role: 'MANAGER' } : null,
      ),
      findFirst: jest.fn(async (): Promise<unknown> =>
        viewer === 'MANAGER' ? { id: 'member-1' } : null,
      ),
      findMany: jest.fn(async (): Promise<unknown[]> =>
        squad.member ? [{ userId: 'player-user-1' }] : [],
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
    /*
     * Enough of Prisma for the stage pager: `where` arrives as the base
     * filter, as `AND: [base, status]`, or as `id: { in }`, and the rows are
     * grouped, counted, and paged from the same in-memory list.
     */
    trialApplication: {
      findMany: jest.fn(
        async (args: { where: Where; skip?: number; take?: number; orderBy?: unknown }) => {
          const rows = applications.filter((a) => matches(a as Row, args.where));
          const from = args.skip ?? 0;
          return rows.slice(from, args.take != null ? from + args.take : undefined);
        },
      ),
      count: jest.fn(
        async (args: { where: Where }) =>
          applications.filter((a) => matches(a as Row, args.where)).length,
      ),
      groupBy: jest.fn(async (args: { where: Where }) => {
        const tally = new Map<string, number>();
        for (const a of applications.filter((a) => matches(a as Row, args.where))) {
          const status = (a as Row).status;
          tally.set(status, (tally.get(status) ?? 0) + 1);
        }
        return [...tally].map(([status, n]) => ({ status, _count: { _all: n } }));
      }),
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
    // Filtered in the query, not after it: every read carries the participant
    // restriction, whether on its own or intersected with a stage.
    const reads = prisma.trialApplication.findMany.mock.calls as unknown as [{ where: Where }][];
    expect(reads.length).toBeGreaterThan(0);
    for (const [args] of reads) {
      const filter = args.where.AND ? args.where.AND[0] : args.where;
      const allowed = typeof filter.status === 'object' ? filter.status.in : [];
      expect(allowed).not.toContain('INVITED');
      expect(allowed).not.toContain('REJECTED');
    }
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

/**
 * Every row says where the applicant stands in the seven words the academy
 * reads (`applicationStage`), so the screens can group by them without
 * re-deriving the rule from four tables.
 */
describe('listApplicationsForTrial — the stage on every row', () => {
  it('reads the verdict and the pass', async () => {
    const rows = [
      row('APPLIED'),
      row('FAILED', { result: { verdict: 'FAIL' } }),
      row('PASSED', { result: { verdict: 'PASS' } }),
      row('REJECTED', { result: { verdict: 'PASS' } }),
    ];
    const { service } = build('MANAGER', rows);

    const { items } = await service.listApplicationsForTrial('manager-1', 'trial-1');

    expect(items.map((item) => item.stage)).toEqual([
      'PENDING',
      'FAILED',
      'PASSED',
      'CANDIDACY_CLOSED',
    ]);
  });

  it('follows the squad invitation after a pass', async () => {
    const offered = [row('ACCEPTED', { result: { verdict: 'PASS' } })];

    const waiting = await build('MANAGER', offered, {
      invitation: { status: 'PENDING' },
    }).service.listApplicationsForTrial('manager-1', 'trial-1');
    const declined = await build('MANAGER', offered, {
      invitation: { status: 'REJECTED' },
    }).service.listApplicationsForTrial('manager-1', 'trial-1');
    const joined = await build('MANAGER', offered, {
      invitation: { status: 'ACCEPTED' },
      member: true,
    }).service.listApplicationsForTrial('manager-1', 'trial-1');

    expect(waiting.items[0].stage).toBe('SQUAD_INVITED');
    expect(declined.items[0].stage).toBe('INVITATION_DECLINED');
    expect(joined.items[0].stage).toBe('SQUAD_JOINED');
  });

  it('asks the squad tables only for the players who were offered a place', async () => {
    const { service, prisma } = build('MANAGER', [row('APPLIED'), row('PASSED')]);

    await service.listApplicationsForTrial('manager-1', 'trial-1');

    expect(prisma.academyInvitation.findMany).not.toHaveBeenCalled();
    expect(prisma.academyMember.findMany).not.toHaveBeenCalled();
  });
});

/**
 * Paged per stage, so an open day with hundreds of applicants is never read
 * whole. A status stage is cut in the database; a stage that depends on the
 * squad invitation is cut from the staged ids. Every page says how many sit
 * at every stage, so the tabs read right before they are opened.
 */
describe('listApplicationsForTrial — one page of one stage', () => {
  const many = [
    ...Array.from({ length: 5 }, (_, i) => ({ ...row('APPLIED'), id: `applied-${i}` })),
    ...Array.from({ length: 3 }, (_, i) => ({
      ...row('PASSED', { result: { verdict: 'PASS' } }),
      id: `passed-${i}`,
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      ...row('ACCEPTED', { result: { verdict: 'PASS' } }),
      id: `offered-${i}`,
    })),
    row('REJECTED', { result: { verdict: 'PASS' } }),
  ];

  it('cuts a status stage in the database', async () => {
    const { service, prisma } = build('MANAGER', many);

    const page = await service.listApplicationsForTrial('manager-1', 'trial-1', {
      stage: 'PENDING',
      page: 2,
      pageSize: 2,
    });

    expect(page.items.map((item) => item.id)).toEqual(['applied-2', 'applied-3']);
    expect(page).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    // The database did the cutting: the page read asked for skip and take.
    const paged = (
      prisma.trialApplication.findMany.mock.calls as unknown as [{ skip?: number; take?: number }][]
    ).find(([args]) => args.take === 2);
    expect(paged?.[0]).toMatchObject({ skip: 2, take: 2 });
  });

  it('cuts a squad stage from the staged ids, in order', async () => {
    const { service } = build('MANAGER', many, { invitation: { status: 'PENDING' } });

    const page = await service.listApplicationsForTrial('manager-1', 'trial-1', {
      stage: 'SQUAD_INVITED',
      page: 1,
      pageSize: 3,
    });

    expect(page.items.map((item) => item.id)).toEqual(['offered-0', 'offered-1', 'offered-2']);
    expect(page.items.every((item) => item.stage === 'SQUAD_INVITED')).toBe(true);
    expect(page.total).toBe(4);
  });

  it('says how many sit at every stage, on every page', async () => {
    const { service } = build('MANAGER', many, { invitation: { status: 'PENDING' } });

    const page = await service.listApplicationsForTrial('manager-1', 'trial-1', {
      stage: 'FAILED',
    });

    expect(page.items).toEqual([]);
    expect(page.counts).toEqual({
      PENDING: 5,
      FAILED: 0,
      PASSED: 3,
      CANDIDACY_CLOSED: 1,
      SQUAD_INVITED: 4,
      INVITATION_DECLINED: 0,
      SQUAD_JOINED: 0,
    });
  });

  it('never reads the pending rows whole for a squad stage', async () => {
    const { service, prisma } = build('MANAGER', many);

    await service.listApplicationsForTrial('manager-1', 'trial-1', { stage: 'SQUAD_JOINED' });

    // Two reads: the light decided set, and the page by id. No read of everything.
    const reads = prisma.trialApplication.findMany.mock.calls as unknown as [{ where: Where }][];
    expect(reads.every(([args]) => args.where.AND || args.where.id)).toBe(true);
  });
});
