import { TrialsService } from './trials.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';

/**
 * The coach's trial queue — the players they still owe a verdict.
 *
 * The rule this has to get right is *which* applications require **this**
 * coach's action. Querying "not passed" would drag in every rejection and every
 * failure they had already settled, and querying by academy would show them a
 * colleague's session. So the tests are about the `where`, and about the fact
 * that a coach is only ever sent their own assignments.
 */

const COACH = 'coach-1';

function build() {
  const prisma = {
    trialApplication: {
      findMany: jest.fn(async (_args: Record<string, unknown>): Promise<unknown[]> => []),
      count: jest.fn(async (_args: Record<string, unknown>): Promise<number> => 0),
    },
  };

  const service = Object.create(TrialsService.prototype) as TrialsService;
  const wired = service as unknown as { prisma: PrismaService; storage: StorageService };
  wired.prisma = prisma as unknown as PrismaService;
  wired.storage = {
    publicUrlOrNull: (key: string) => (key ? `https://cdn/${key}` : null),
  } as never;

  return { service, prisma };
}

async function queryFor(options?: { page?: number; pageSize?: number }) {
  const { service, prisma } = build();
  await service.listPendingForCoach(COACH, options);
  const [args] = prisma.trialApplication.findMany.mock.calls[0] ?? [];
  if (!args) throw new Error('the queue never asked for applications');
  return args as Record<string, any>;
}

describe('which applications reach a coach’s queue', () => {
  /* Scoping — this is the authorization, not a nicety. */
  it('asks only for sessions this coach is assigned to', async () => {
    const { where } = await queryFor();
    expect(where.trial.coaches.some.coachUserId).toBe(COACH);
  });

  /*
   * The two states `recordVerdict` accepts, which is also exactly "no verdict
   * yet": writing one moves the row to PASSED or FAILED.
   */
  it('asks only for applications still owed a verdict', async () => {
    const { where } = await queryFor();
    expect(where.status).toEqual({ in: ['APPLIED', 'CONFIRMED'] });
  });

  it.each([['PASSED'], ['FAILED'], ['REJECTED'], ['INVITED'], ['SHORTLISTED']])(
    'leaves %s out of the queue',
    async (status) => {
      const { where } = await queryFor();
      expect(where.status.in).not.toContain(status);
    },
  );

  /*
   * Deliberately absent. `recordVerdict` does not check the trial's status
   * either, so a session archived with players still unanswered is work the
   * coach can actually do — filtering it here would hide work while leaving the
   * endpoint that performs it open.
   */
  it('does not filter on the trial’s own status', async () => {
    const { where } = await queryFor();
    expect(where.trial.status).toBeUndefined();
  });

  /* Both kinds: the queue is a list of jobs, and the job is the same. */
  it('does not filter on the trial’s type', async () => {
    const { where } = await queryFor();
    expect(where.trial.type).toBeUndefined();
  });
});

describe('paging the coach’s queue', () => {
  it('pages in the database rather than in the browser', async () => {
    const args = await queryFor({ page: 3, pageSize: 12 });
    expect(args.skip).toBe(24);
    expect(args.take).toBe(12);
  });

  it('starts on the first page', async () => {
    const args = await queryFor();
    expect(args.skip).toBe(0);
  });

  it('counts against the same condition it lists', async () => {
    const { service, prisma } = build();
    await service.listPendingForCoach(COACH);

    const [listed] = prisma.trialApplication.findMany.mock.calls[0] as [Record<string, any>];
    const [counted] = prisma.trialApplication.count.mock.calls[0] as [Record<string, any>];
    // A total computed from a different filter than the list is a page count
    // that does not match the pages.
    expect(counted.where).toEqual(listed.where);
  });

  it('reports the page it returned', async () => {
    const { service, prisma } = build();
    prisma.trialApplication.count.mockResolvedValue(37);

    const result = await service.listPendingForCoach(COACH, { page: 2, pageSize: 12 });
    expect(result).toMatchObject({ total: 37, page: 2, pageSize: 12 });
  });
});

describe('what a queue row carries', () => {
  it('brings the player and the session in one query, not one per card', async () => {
    const args = await queryFor();

    // Both on the select, so a page of twenty costs one query rather than 41.
    expect(args.select.player.select.firstName).toBe(true);
    expect(args.select.trial.select.title).toBe(true);
    expect(args.select.trial.select.type).toBe(true);
  });

  it('resolves the player’s photograph into a URL', async () => {
    const { service, prisma } = build();
    prisma.trialApplication.findMany.mockResolvedValue([
      {
        id: 'application-1',
        status: 'APPLIED',
        trial: { id: 'trial-1', type: 'GENERAL' },
        player: { id: 'player-1', firstName: 'Aziz', user: { avatarKey: 'public/a.jpg' } },
      },
    ]);

    const { items } = await service.listPendingForCoach(COACH);
    expect(items[0].player.avatarUrl).toBe('https://cdn/public/a.jpg');
    // The raw key does not leave the service — callers get the URL or nothing.
    expect((items[0].player as Record<string, unknown>).user).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Why the queue was empty in the first place                                 */
/* -------------------------------------------------------------------------- */

describe('a new trial gets the academy’s coaches', () => {
  /*
   * The root cause of "coach dashboard is empty".
   *
   * `create` wrote the trial and stopped. Staffing it was a second step on the
   * trial's own page that a manager can simply not know about — so a published
   * open day collected four applicants against an empty `TrialCoach`, nobody
   * could write a verdict, and the assigned coach's queue was correctly empty
   * because they had never been assigned. The queue query was right; the data
   * it queried had never been written.
   */
  it('attaches everybody the academy has endorsed as a coach', () => {
    const source = TrialsService.prototype.create.toString();

    expect(source).toMatch(/academyEndorsement\.findMany/);
    expect(source).toMatch(/trialCoach\.createMany/);
    expect(source).toMatch(/role: 'COACH'/);
    expect(source).toMatch(/status: 'ACTIVE'/);
  });

  /* An academy with no coaches yet still gets its trial — it just has no staff
     on it, which the trial page now says out loud. */
  it('still creates the trial when the academy has no coaches', () => {
    expect(TrialsService.prototype.create.toString()).toMatch(/coaches\.length > 0/);
  });
});
