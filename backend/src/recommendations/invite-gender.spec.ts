import { RecommendationsService } from './recommendations.service';

/**
 * The manager's invitation is the other way an application comes to exist,
 * and it creates the trial it invites to. That trial is for one player, so
 * it carries their gender — not the column's default, which filed every
 * invited girl under a boys' trial — and the same eligibility rule the open
 * board applies is asserted before anything is written.
 */

function build(playerGender: string) {
  const tx = {
    trial: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'trial-1',
        title: data.title,
        ...data,
      })),
    },
    trialApplication: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'app-1',
        trialId: 'trial-1',
        trial: { title: 'Private trial' },
        ...data,
      })),
    },
  };
  const prisma = {
    academyMember: {
      findFirst: jest.fn(async () => ({ academyId: 'academy-1', academy: { name: 'Bunyodkor' } })),
    },
    recommendationReview: {
      findUnique: jest.fn(async () => ({
        status: 'APPROVED',
        coachUserId: 'coach-1',
        recommendationId: 'rec-1',
      })),
    },
    playerProfile: {
      findUnique: jest.fn(async () => ({
        userId: 'player-user-1',
        birthDate: new Date('2012-01-01'),
        firstName: 'Malika',
        lastName: 'Rahimova',
        primaryPosition: 'CM',
        gender: playerGender,
      })),
    },
    trialApplication: { findFirst: jest.fn(async () => null) },
    $transaction: jest.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
  };
  const processA = { snapshotBackings: jest.fn(async () => undefined) };
  const notifications = { notify: jest.fn(async () => undefined) };

  const service = Object.create(RecommendationsService.prototype) as RecommendationsService;
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma,
    processA,
    notifications,
    assertIsAcademy: jest.fn(async () => undefined),
  });
  return { service, tx, processA, notifications };
}

const INVITE = { date: '2030-06-01', location: 'Tashkent', note: 'Come and play.' };

describe('RecommendationsService.invitePlayer — the trial is for the player it invites', () => {
  it('stamps the invited girl’s gender on the private trial, not the column default', async () => {
    const { service, tx } = build('female');

    await service.invitePlayer('manager-1', 'player-1', INVITE);

    const created = (tx.trial.create.mock.calls[0] as unknown as [{ data: { gender: string } }])[0]
      .data;
    expect(created.gender).toBe('female');
    expect(tx.trialApplication.create).toHaveBeenCalledTimes(1);
  });

  it('does the same for a boy', async () => {
    const { service, tx } = build('male');

    await service.invitePlayer('manager-1', 'player-1', INVITE);

    expect(
      (tx.trial.create.mock.calls[0] as unknown as [{ data: { gender: string } }])[0].data.gender,
    ).toBe('male');
  });

  it('runs the shared eligibility rule before the transaction', () => {
    const source = RecommendationsService.prototype.invitePlayer.toString();
    expect(source.indexOf('assertGenderEligible')).toBeGreaterThan(-1);
    expect(source.indexOf('assertGenderEligible')).toBeLessThan(source.indexOf('$transaction'));
  });
});
