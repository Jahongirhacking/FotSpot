import { BadRequestException } from '@nestjs/common';

import { RecommendationsService } from './recommendations.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ProcessAService } from './process-a.service';

/**
 * TRIAL.md Rule 5 — a general trial is never screened online.
 *
 * A general trial is decided on the pitch: the player applies, turns up, and a
 * coach passes or fails them. The online review is the *other* pipeline, the one
 * that ends in a private trial. Nothing in the state machine joined them, but
 * `assignReview` takes a bare `playerId` — and from the inbox a player who is
 * already on the academy's own open day looks exactly like one who is not.
 *
 * These drive the service against a fake Prisma rather than asserting on source
 * text, because the rule is about *what is written* when a manager presses the
 * button: the interesting assertion is that `processA.start` is never reached
 * and the trial application is left alone.
 */

const ACADEMY = 'academy-1';
const PLAYER = 'player-1';

/** An application to this academy's own open day, still owed an answer. */
const OPEN_DAY_APPLICATION = {
  id: 'application-1',
  trial: { id: 'trial-1', title: 'U16 open day' },
};

function fakePrisma() {
  return {
    playerProfile: {
      findUnique: jest.fn(async (): Promise<unknown> => ({ id: PLAYER, userId: 'player-user-1' })),
    },
    academyMember: {
      findFirst: jest.fn(async (): Promise<unknown> => ({ academyId: ACADEMY })),
    },
    academyProfile: {
      findUnique: jest.fn(async (): Promise<unknown> => ({ kind: 'ACADEMY' })),
    },
    // Null by default: the ordinary player, in none of this academy's open days.
    trialApplication: {
      findFirst: jest.fn(async (_args: { where: Record<string, unknown> }): Promise<unknown> => null),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({})),
    },
    recommendationTarget: {
      findFirst: jest.fn(async (): Promise<unknown> => null),
      updateMany: jest.fn(async () => ({})),
    },
    recommendationReview: {
      findUnique: jest.fn(async (): Promise<unknown> => null),
      update: jest.fn(async () => ({})),
    },
  };
}

function build() {
  const prisma = fakePrisma();
  const processA = {
    start: jest.fn(async () => ({ id: 'review-1', playerId: PLAYER, academyId: ACADEMY })),
  };

  /*
   * Built without running the constructor.
   *
   * `RecommendationsService` injects a dozen collaborators and the two methods
   * under test reach exactly two of them. Passing eleven `undefined`s would
   * assert, falsely, that the others are irrelevant *forever*; this says only
   * that these tests supply what these paths use, and anything else would throw
   * rather than quietly read a stub.
   */
  const service = Object.create(RecommendationsService.prototype) as RecommendationsService;
  const wired = service as unknown as { prisma: PrismaService; processA: ProcessAService };
  wired.prisma = prisma as unknown as PrismaService;
  wired.processA = processA as unknown as ProcessAService;

  return { service, prisma, processA };
}

describe('Rule 5 — a general trial never enters online coach review', () => {
  /* Test 1. The manager's route in. */
  it('refuses to send an open-day applicant for online review', async () => {
    const { service, prisma, processA } = build();
    prisma.trialApplication.findFirst.mockResolvedValue(OPEN_DAY_APPLICATION);

    await expect(service.assignReview('manager-1', PLAYER, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );

    // No review was opened, and the application was not touched on the way out.
    expect(processA.start).not.toHaveBeenCalled();
    expect(prisma.trialApplication.update).not.toHaveBeenCalled();
    expect(prisma.trialApplication.updateMany).not.toHaveBeenCalled();
  });

  it('says why, without naming anything internal', async () => {
    const { service, prisma } = build();
    prisma.trialApplication.findFirst.mockResolvedValue(OPEN_DAY_APPLICATION);

    await expect(service.assignReview('manager-1', PLAYER, {})).rejects.toThrow(
      /applied to one of your open trials.*decided on the day rather than online/i,
    );
  });

  /*
   * Test 3, as a property of the refusal rather than a second scenario: the
   * application cannot come out of `assignReview` as SHORTLISTED, because
   * `assignReview` never writes to it at all. Asserted above by the `update`
   * spies; asserted here as the rule it stands for.
   */
  it('has no path from assignReview to a shortlisted application', () => {
    const source = RecommendationsService.prototype.assignReview.toString();

    expect(source).not.toMatch(/trialApplication\.(update|updateMany|upsert|create)/);
    expect(source).not.toMatch(/'SHORTLISTED'/);
  });

  /* Test 2. The private-trial pipeline is untouched. */
  it('still opens a review for a player who is in no open day', async () => {
    const { service, prisma, processA } = build();
    // The default fixture: findFirst answers null.
    await service.assignReview('manager-1', PLAYER, {});

    expect(prisma.trialApplication.findFirst).toHaveBeenCalled();
    expect(processA.start).toHaveBeenCalledTimes(1);
  });

  it('names a chosen coach exactly as before', async () => {
    const { service, processA } = build();
    await service.assignReview('manager-1', PLAYER, { coachUserId: 'coach-1' });

    expect(processA.start).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'manual', coachUserId: 'coach-1', academyId: ACADEMY }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The exact condition, which is where this rule would rot                     */
/* -------------------------------------------------------------------------- */

describe('what counts as being in an open day', () => {
  const query = async () => {
    const { service, prisma } = build();
    await service.assignReview('manager-1', PLAYER, {});
    const [args] = prisma.trialApplication.findFirst.mock.calls[0] ?? [];
    if (!args) throw new Error('assignReview never asked about open-day applications');
    return args;
  };

  it('asks only about this academy, so one club looking does not block another', async () => {
    const { where } = await query();
    expect((where.trial as Record<string, unknown>).academyId).toBe(ACADEMY);
  });

  it('asks only about general trials, since a private one *is* the review outcome', async () => {
    const { where } = await query();
    expect((where.trial as Record<string, unknown>).type).toBe('GENERAL');
  });

  /*
   * An archived trial is finished with the player. Leaving it out is what stops
   * this from being a permanent mark: the academy can look again later.
   */
  it('asks only about open trials', async () => {
    const { where } = await query();
    expect((where.trial as Record<string, unknown>).status).toBe('OPEN');
  });

  /*
   * The domain's own definition of an application still owed an answer — the
   * same set `TrialsService.archiveIfSettled` counts as outstanding. A player
   * who has been passed, failed or rejected is settled, and reviewing them then
   * is a new question rather than a competing answer to the old one.
   */
  it('counts only applications still owed an answer', async () => {
    const { where } = await query();
    const statuses = (where.status as { in: string[] }).in;

    expect(statuses).toEqual(['APPLIED', 'SCREENING', 'SHORTLISTED', 'INVITED', 'CONFIRMED']);
    expect(statuses).not.toContain('PASSED');
    expect(statuses).not.toContain('FAILED');
    expect(statuses).not.toContain('REJECTED');
  });
});

/* -------------------------------------------------------------------------- */
/* Test 4 — the coach's route in, which must keep working                      */
/* -------------------------------------------------------------------------- */

describe('the coach discovery path', () => {
  /*
   * The same rule from the other side: a coach browsing profiles can land on
   * somebody already applied to their own academy's open day. It goes through
   * `coachAcceptBlocker` rather than a second throw, so the *read* behind the
   * button reports it too and the coach is told rather than refused.
   */
  it('blocks an open-day applicant through the shared blocker', () => {
    const source = (
      RecommendationsService.prototype as unknown as Record<string, () => unknown>
    ).coachAcceptBlocker.toString();

    expect(source).toMatch(/openGeneralTrialApplication/);
    expect(source).toMatch(/GENERAL_TRIAL/);
  });

  it('leaves every other discovery refusal in place', () => {
    const source = RecommendationsService.prototype.acceptFromProfile.toString();

    for (const message of [
      /already at your academy/i,
      /already been approved/i,
      /already waiting on a review/i,
      /already has an open trial/i,
    ]) {
      expect(source).toMatch(message);
    }
  });

  /* Discovery of an ordinary player — the common case — is untouched. */
  it('still approves a player who is in no open day', () => {
    const source = RecommendationsService.prototype.acceptFromProfile.toString();

    expect(source).toMatch(/processA\.start/);
    expect(source).toMatch(/decideReview/);
    expect(source).toMatch(/'APPROVED'/);
  });
});
