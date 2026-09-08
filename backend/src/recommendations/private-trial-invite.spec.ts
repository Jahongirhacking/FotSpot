import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';

/**
 * A private trial invitation — TRIAL.md §11.
 *
 * Who may send one, who ends up running it, and what it writes. The fake
 * Prisma answers "manager of academy-1" or "coach of academy-1" per test; the
 * assertions are on the trial and application the transaction creates.
 */

const PLAYER = {
  userId: 'player-user-1',
  birthDate: new Date('2012-01-01'),
  firstName: 'Malika',
  lastName: 'Rahimova',
  primaryPosition: 'CM',
  gender: 'female',
};

function build(caller: 'manager' | 'coach' | 'nobody') {
  const tx = {
    trial: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'trial-1',
        ...data,
      })),
    },
    trialApplication: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'app-1',
        trialId: 'trial-1',
        trial: { title: 'Private trial — Malika Rahimova' },
        ...data,
      })),
    },
  };
  const academy = { academyId: 'academy-1', academy: { name: 'Bunyodkor' } };
  const prisma = {
    academyMember: {
      // First call resolves a manager, second a credible coach — see inviterFor.
      findFirst: jest.fn(async ({ where }: { where: { role: string } }) => {
        if (where.role === 'MANAGER') return caller === 'manager' ? academy : null;
        if (where.role === 'COACH') return caller === 'coach' ? academy : null;
        return null;
      }),
    },
    academyProfile: { findUnique: jest.fn(async () => ({ kind: 'ACADEMY' })) },
    playerProfile: { findUnique: jest.fn(async () => PLAYER) },
    academyEndorsement: {
      findFirst: jest.fn(async ({ where }: { where: { userId: string } }) =>
        where.userId === 'coach-1' ? { userId: 'coach-1' } : null,
      ),
    },
    trialApplication: { findFirst: jest.fn(async (): Promise<{ id: string } | null> => null) },
    recommendationTarget: {
      findFirst: jest.fn(async ({ where }: { where: { recommendationId: string } }) =>
        where.recommendationId === 'rec-mine' ? { recommendationId: 'rec-mine' } : null,
      ),
    },
    $transaction: jest.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
  };
  const backings = { snapshotBackings: jest.fn(async () => undefined) };
  const notifications = { notify: jest.fn(async () => undefined) };

  const service = Object.create(RecommendationsService.prototype) as RecommendationsService;
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma,
    backings,
    notifications,
  });
  return { service, prisma, tx, backings, notifications };
}

const INVITE = { date: '2030-06-01', location: 'Tashkent', note: 'Come and play.' };
const created = (tx: ReturnType<typeof build>['tx']) =>
  (tx.trial.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;

describe('invitePlayer — who may, and who runs it', () => {
  it('a manager invites and names the coach who will run the trial', async () => {
    const { service, tx, backings, notifications } = build('manager');

    const application = await service.invitePlayer('manager-1', 'player-1', {
      ...INVITE,
      coachUserId: 'coach-1',
    });

    expect(created(tx)).toMatchObject({
      type: 'PRIVATE',
      gender: 'female',
      location: 'Tashkent',
      coaches: { create: { coachUserId: 'coach-1' } },
    });
    expect(application.status).toBe('INVITED');
    expect(backings.snapshotBackings).toHaveBeenCalledWith('app-1', 'player-1', 'academy-1');
    expect(notifications.notify).toHaveBeenCalledWith(
      'player-user-1',
      'TRIAL_INVITATION',
      expect.objectContaining({ applicationId: 'app-1', academyName: 'Bunyodkor' }),
      { userId: 'manager-1', role: 'academy_manager' },
    );
  });

  it('a manager must name a coach — a trial nobody runs has no verdict', async () => {
    const { service, tx } = build('manager');

    await expect(service.invitePlayer('manager-1', 'player-1', INVITE)).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.trial.create).not.toHaveBeenCalled();
  });

  it('a manager cannot name a coach the academy has not endorsed', async () => {
    const { service } = build('manager');

    await expect(
      service.invitePlayer('manager-1', 'player-1', { ...INVITE, coachUserId: 'stranger' }),
    ).rejects.toThrow(BadRequestException);
  });

  /* Coach creates → that coach runs it. No coach-selection step (§8). */
  it('a coach who invites is the assigned coach, whatever the request names', async () => {
    const { service, tx, notifications } = build('coach');

    await service.invitePlayer('coach-1', 'player-1', { ...INVITE, coachUserId: 'coach-9' });

    expect(created(tx)).toMatchObject({ coaches: { create: { coachUserId: 'coach-1' } } });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.anything(),
      'TRIAL_INVITATION',
      expect.anything(),
      { userId: 'coach-1', role: 'coach' },
    );
  });

  it('refuses anybody who is neither manager nor coach of an academy', async () => {
    const { service, tx } = build('nobody');

    await expect(
      service.invitePlayer('scout-1', 'player-1', { ...INVITE, coachUserId: 'coach-1' }),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.trial.create).not.toHaveBeenCalled();
  });

  it('refuses a second open invitation from the same academy', async () => {
    const { service, prisma, tx } = build('manager');
    prisma.trialApplication.findFirst.mockResolvedValue({ id: 'app-0' });

    await expect(
      service.invitePlayer('manager-1', 'player-1', { ...INVITE, coachUserId: 'coach-1' }),
    ).rejects.toThrow(ConflictException);
    expect(tx.trial.create).not.toHaveBeenCalled();
  });
});

describe('invitePlayer — the inbox recommendation it answers', () => {
  it('links a recommendation addressed to this academy about this player', async () => {
    const { service, tx } = build('manager');

    await service.invitePlayer('manager-1', 'player-1', {
      ...INVITE,
      coachUserId: 'coach-1',
      recommendationId: 'rec-mine',
    });

    const application = (
      tx.trialApplication.create.mock.calls[0] as unknown as [
        { data: { recommendationId: unknown } },
      ]
    )[0].data;
    expect(application.recommendationId).toBe('rec-mine');
  });

  it('ignores a recommendation id that was not addressed here', async () => {
    const { service, tx } = build('manager');

    await service.invitePlayer('manager-1', 'player-1', {
      ...INVITE,
      coachUserId: 'coach-1',
      recommendationId: 'rec-elsewhere',
    });

    const application = (
      tx.trialApplication.create.mock.calls[0] as unknown as [
        { data: { recommendationId: unknown } },
      ]
    )[0].data;
    expect(application.recommendationId).toBeNull();
  });
});
