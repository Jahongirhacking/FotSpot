import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TrialsService } from './trials.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { ProcessAService } from '../recommendations/process-a.service';
import type { RecommendationsService } from '../recommendations/recommendations.service';
import type { InvitationsService } from '../academies/invitations.service';
import type { RedisService } from '../redis/redis.service';

/**
 * The rules under test are TRIAL.md's, not this file's inventions:
 *
 *   Rule 5   a general trial is not screened online
 *   Rule 7   a coach tests the player in person
 *   Rule 8   only a trial PASS reaches a squad
 *   Rule 11  a FAIL settles the backing scouts
 *   Rule 13  only a PASS clears the player's recommendations
 *   Rule 16  the academy does not evaluate the football
 *
 * Each one had a counterexample in this service before the split.
 */

const TRIAL = {
  id: 'trial-1',
  /** Comfortably before the exam, so the default fixture takes applications. */
  applyDeadline: new Date('2030-05-20'),
  academyId: 'academy-1',
  title: 'U16 open day',
  location: 'Tashkent',
  date: new Date('2030-06-01'),
  status: 'OPEN',
  type: 'GENERAL',
  ageRangeMin: 10,
  ageRangeMax: 20,
};

const PLAYER = {
  id: 'player-1',
  userId: 'player-user-1',
  firstName: 'Aziz',
  lastName: 'Karimov',
  birthDate: new Date('2015-03-04'),
};

function fakePrisma() {
  const tx = {
    coachAssessment: { create: jest.fn(async () => ({ id: 'assessment-1' })) },
    trialResult: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'result-1',
        ...data,
      })),
    },
    trialApplication: { update: jest.fn(async () => ({})) },
  };

  const prisma = {
    $transaction: jest.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
    trial: {
      findUnique: jest.fn(async (): Promise<unknown> => TRIAL),
      // Echoes the edit back over the fixture, so `update` returns the trial as
      // it now stands — which is what the reschedule notice reads its date from.
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...TRIAL,
        ...data,
      })),
      updateMany: jest.fn(async () => ({})),
    },
    trialApplication: {
      findUnique: jest.fn(),
      update: jest.fn(async () => ({})),
      upsert: jest.fn(async () => ({ id: 'app-1', status: 'APPLIED' })),
      findMany: jest.fn(async (): Promise<unknown> => []),
      // `archiveIfSettled` asks twice: how many are still owed a verdict, and
      // how many there are at all. One outstanding by default, so the default
      // case is a trial that stays open.
      count: jest.fn(async (): Promise<number> => 1),
    },
    // `Promise<unknown>` on the ones individual tests re-resolve: an inferred
    // return type pins them to the happy-path shape, and "this row is missing"
    // is half of what is being tested.
    trialCoach: {
      findUnique: jest.fn(async (): Promise<unknown> => ({
        trialId: 'trial-1',
        coachUserId: 'coach-1',
      })),
    },
    coachProfile: {
      findUnique: jest.fn(async (): Promise<unknown> => ({ id: 'coach-profile-1' })),
    },
    academyMember: {
      findUnique: jest.fn(async (): Promise<unknown> => ({ role: 'MANAGER' })),
      findFirst: jest.fn(async (): Promise<unknown> => ({ userId: 'manager-1' })),
    },
    playerProfile: { findUnique: jest.fn(async () => PLAYER) },
  };

  return { prisma, tx };
}

function build() {
  const { prisma, tx } = fakePrisma();
  const notifications = { notify: jest.fn(async () => undefined) };
  const processA = {
    start: jest.fn(async () => ({ id: 'review-1' })),
    snapshotBackings: jest.fn(async () => undefined),
    backingsOf: jest.fn(async () => ['rec-1', 'rec-2']),
  };
  const invitations = { invite: jest.fn(async () => ({ id: 'invitation-1' })) };
  const recommendations = {
    clearPlayerRecommendations: jest.fn(async () => undefined),
    settleTrialBackings: jest.fn(async () => undefined),
  };
  const redis = { del: jest.fn(async () => undefined) };

  const service = new TrialsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    processA as unknown as ProcessAService,
    invitations as unknown as InvitationsService,
    recommendations as unknown as RecommendationsService,
    redis as unknown as RedisService,
  );

  return { service, prisma, tx, notifications, processA, invitations, recommendations, redis };
}

/** An application as it stands the moment a coach is about to decide. */
function pendingApplication(status: string) {
  return {
    id: 'app-1',
    trialId: 'trial-1',
    playerId: PLAYER.id,
    status,
    recommendationId: 'rec-1',
    trial: TRIAL,
    player: PLAYER,
    result: null,
  };
}

describe('TrialsService — the general trial route (Rule 5)', () => {
  it('does not screen an applicant online, and leaves them at APPLIED', async () => {
    const { service, processA } = build();

    const application = await service.apply('player-user-1', 'trial-1');

    expect(processA.start).not.toHaveBeenCalled();
    expect(application.status).toBe('APPLIED');
  });

  it('still snapshots the backing scouts, because the verdict will settle them', async () => {
    const { service, processA } = build();

    await service.apply('player-user-1', 'trial-1');

    expect(processA.snapshotBackings).toHaveBeenCalledWith('app-1', PLAYER.id, 'academy-1');
  });
});

describe('TrialsService.recordVerdict — who may decide (Rules 7, 16)', () => {
  it('refuses anybody who is not working this trial', async () => {
    const { service, prisma } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('APPLIED'));
    prisma.trialCoach.findUnique.mockResolvedValue(null);

    await expect(service.recordVerdict('manager-1', 'app-1', { verdict: 'PASS' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses a player who was never expected on the day', async () => {
    const { service, prisma } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('INVITED'));

    await expect(service.recordVerdict('coach-1', 'app-1', { verdict: 'PASS' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('answers once — a second verdict is a second trial', async () => {
    const { service, prisma } = build();
    prisma.trialApplication.findUnique.mockResolvedValue({
      ...pendingApplication('CONFIRMED'),
      result: { id: 'result-1' },
    });

    await expect(service.recordVerdict('coach-1', 'app-1', { verdict: 'FAIL' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('passes a player on the button alone — a verdict asks for no ratings', async () => {
    const { service, prisma, tx } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('APPLIED'));

    await expect(service.recordVerdict('coach-1', 'app-1', { verdict: 'PASS' })).resolves.toEqual(
      expect.objectContaining({ verdict: 'PASS' }),
    );
    // A verdict never writes attributes. Rule 22.
    expect(tx.coachAssessment.create).not.toHaveBeenCalled();
  });

  it('never writes attributes, even on a pass — one morning is not a season (Rule 22)', async () => {
    const { service, prisma, tx } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('CONFIRMED'));

    await service.recordVerdict('coach-1', 'app-1', { verdict: 'PASS' });

    // Scoring a player belongs to a coach who shares their squad group
    // (Rule 21) — a trialist shares one with nobody, so there is no verdict
    // this service may turn into a CoachAssessment row.
    expect(tx.coachAssessment.create).not.toHaveBeenCalled();
  });

  it('fails one without them too — declining honestly must stay cheap', async () => {
    const { service, prisma } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('APPLIED'));

    await expect(service.recordVerdict('coach-1', 'app-1', { verdict: 'FAIL' })).resolves.toEqual(
      expect.objectContaining({ verdict: 'FAIL' }),
    );
  });
});

describe('TrialsService.recordVerdict — what a verdict settles (Rules 11-13)', () => {
  it('a PASS clears the recommendations and settles every backer as accepted', async () => {
    const { service, prisma, tx, recommendations } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('CONFIRMED'));

    await service.recordVerdict('coach-1', 'app-1', { verdict: 'PASS' });

    expect(recommendations.clearPlayerRecommendations).toHaveBeenCalledWith(PLAYER.id);
    expect(recommendations.settleTrialBackings).toHaveBeenCalledWith({
      recommendationIds: ['rec-1', 'rec-2'],
      academyId: 'academy-1',
      status: 'ACCEPTED',
      // Attributed to the coach: the scouts are settled by their verdict.
      actor: { userId: 'coach-1', role: 'coach' },
    });
    expect(tx.trialApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PASSED' } }),
    );
  });

  it('a FAIL settles the backers without clearing anything', async () => {
    const { service, prisma, tx, recommendations } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('APPLIED'));

    await service.recordVerdict('coach-1', 'app-1', { verdict: 'FAIL' });

    expect(recommendations.clearPlayerRecommendations).not.toHaveBeenCalled();
    expect(recommendations.settleTrialBackings).toHaveBeenCalledWith({
      recommendationIds: ['rec-1', 'rec-2'],
      academyId: 'academy-1',
      status: 'REJECTED',
      actor: { userId: 'coach-1', role: 'coach' },
    });
    expect(tx.trialApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });

  it('tells the manager about a pass — it is the only verdict that asks them for anything', async () => {
    const { service, prisma, notifications } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('CONFIRMED'));

    await service.recordVerdict('coach-1', 'app-1', { verdict: 'PASS' });

    expect(notifications.notify).toHaveBeenCalledWith(
      'manager-1',
      'TRIAL_RESULT',
      expect.objectContaining({ verdict: 'PASS' }),
      // Every notification now says who caused it, and in what capacity.
      { userId: 'coach-1', role: 'coach' },
    );
  });

  it('does not tell the manager about a fail', async () => {
    const { service, prisma, notifications } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('APPLIED'));

    await service.recordVerdict('coach-1', 'app-1', { verdict: 'FAIL' });

    // The player still hears; the manager is not asked to act on a no.
    expect(notifications.notify).toHaveBeenCalledWith(
      PLAYER.userId,
      'TRIAL_RESULT',
      expect.objectContaining({ verdict: 'FAIL' }),
      { userId: 'coach-1', role: 'coach' },
    );
    expect(notifications.notify).not.toHaveBeenCalledWith(
      'manager-1',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('places nobody on its own — that is the manager’s (Rule 9)', async () => {
    const { service, prisma, invitations } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('CONFIRMED'));

    await service.recordVerdict('coach-1', 'app-1', { verdict: 'PASS' });

    expect(invitations.invite).not.toHaveBeenCalled();
  });
});

describe('TrialsService — the application deadline', () => {
  it('refuses an application once the deadline has passed', async () => {
    const { service, prisma } = build();
    prisma.trial.findUnique.mockResolvedValue({
      ...TRIAL,
      applyDeadline: new Date('2020-01-01'),
    });

    await expect(service.apply('player-user-1', 'trial-1')).rejects.toThrow(BadRequestException);
  });

  it('accepts one before it', async () => {
    const { service, prisma } = build();
    prisma.trial.findUnique.mockResolvedValue({
      ...TRIAL,
      applyDeadline: new Date('2030-05-01'),
    });

    await expect(service.apply('player-user-1', 'trial-1')).resolves.toEqual(
      expect.objectContaining({ status: 'APPLIED' }),
    );
  });

  it('will not create a trial whose applications close after it happens', async () => {
    const { service } = build();

    await expect(
      service.create('manager-1', 'academy-1', {
        title: 'U16 open day',
        location: 'Tashkent',
        date: '2030-06-01T09:00:00.000Z',
        applyDeadline: '2030-06-02T09:00:00.000Z',
        ageRangeMin: 10,
        ageRangeMax: 20,
        positions: [],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('TrialsService.update — moving the exam date', () => {
  it('tells everybody still in play, with the date it moved from', async () => {
    const { service, prisma, notifications } = build();
    prisma.trialApplication.findMany.mockResolvedValue([
      { id: 'app-1', player: { userId: 'player-user-1' } },
    ]);

    await service.update('manager-1', 'trial-1', { date: '2030-07-15T09:00:00.000Z' });

    expect(notifications.notify).toHaveBeenCalledWith(
      'player-user-1',
      'TRIAL_RESCHEDULED',
      expect.objectContaining({
        trialId: 'trial-1',
        previousDate: TRIAL.date.toISOString(),
      }),
      { userId: 'manager-1', role: 'academy_manager' },
    );
  });

  it('says nothing when the date did not move', async () => {
    const { service, notifications } = build();

    await service.update('manager-1', 'trial-1', { location: 'Samarkand' });

    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

describe('TrialsService — archiving a finished trial', () => {
  it('archives once nobody is left to answer for', async () => {
    const { service, prisma } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('CONFIRMED'));
    // No outstanding applications, one in total.
    prisma.trialApplication.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    await service.recordVerdict('coach-1', 'app-1', { verdict: 'PASS' });

    expect(prisma.trial.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ARCHIVED' } }),
    );
  });

  it('leaves it open while somebody is still expected', async () => {
    const { service, prisma } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('APPLIED'));
    prisma.trialApplication.count.mockResolvedValueOnce(3).mockResolvedValueOnce(4);

    await service.recordVerdict('coach-1', 'app-1', { verdict: 'FAIL' });

    expect(prisma.trial.updateMany).not.toHaveBeenCalled();
  });

  it('leaves a trial nobody applied to alone', async () => {
    const { service, prisma } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('APPLIED'));
    prisma.trialApplication.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    await service.recordVerdict('coach-1', 'app-1', { verdict: 'FAIL' });

    expect(prisma.trial.updateMany).not.toHaveBeenCalled();
  });
});

describe('TrialsService.addToSquad — the gate is a trial PASS (Rule 8)', () => {
  it.each(['APPLIED', 'SCREENING', 'SHORTLISTED', 'INVITED', 'CONFIRMED', 'FAILED'])(
    'refuses an application at %s',
    async (status) => {
      const { service, prisma } = build();
      prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication(status));

      await expect(service.addToSquad('manager-1', 'app-1')).rejects.toThrow(BadRequestException);
    },
  );

  it('invites a passed player to join, rather than writing the membership itself', async () => {
    const { service, prisma, invitations } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('PASSED'));

    await service.addToSquad('manager-1', 'app-1');

    expect(invitations.invite).toHaveBeenCalledWith(
      'manager-1',
      'academy-1',
      expect.objectContaining({ userId: PLAYER.userId, role: 'PLAYER' }),
    );
    expect(prisma.trialApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACCEPTED' } }),
    );
  });

  it('refuses somebody who is not the academy manager', async () => {
    const { service, prisma } = build();
    prisma.trialApplication.findUnique.mockResolvedValue(pendingApplication('PASSED'));
    prisma.academyMember.findUnique.mockResolvedValue({ role: 'COACH' });

    await expect(service.addToSquad('coach-1', 'app-1')).rejects.toThrow(ForbiddenException);
  });
});
