import { ConflictException, NotFoundException } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';

/**
 * Who a scout may put forward at all.
 *
 * A recommendation is "look at this player". There is nobody to say it to
 * about a player an academy already has, and nothing to add about one an
 * academy is already looking at on a pitch. So the profile is told the reason
 * instead of drawing a button, and the endpoint refuses the same cases with a
 * 409 — the button is a clarity decision, never the boundary.
 */

const PLAYER_ID = 'player-profile-1';
const PLAYER_USER = 'player-user-1';

function build(overrides: { member?: boolean; application?: boolean } = {}) {
  const prisma = {
    playerProfile: {
      findUnique: jest.fn(async (): Promise<unknown> => ({ id: PLAYER_ID, userId: PLAYER_USER })),
    },
    academyMember: {
      findFirst: jest.fn(async (): Promise<unknown> =>
        overrides.member ? { id: 'member-1' } : null,
      ),
    },
    trialApplication: {
      findFirst: jest.fn(
        async (_args: { where: { status: { in: string[] } } }): Promise<unknown> =>
          overrides.application ? { id: 'app-1' } : null,
      ),
    },
    recommendation: { findFirst: jest.fn(async (): Promise<unknown> => null) },
  };

  const service = Object.create(RecommendationsService.prototype) as RecommendationsService;
  (service as unknown as { prisma: unknown }).prisma = prisma;

  return { service, prisma };
}

describe('recommendEligibility', () => {
  it('lets a free player be recommended', async () => {
    const { service } = build();

    await expect(service.recommendEligibility(PLAYER_ID)).resolves.toEqual({
      canRecommend: true,
      reason: null,
    });
  });

  it('names an academy membership as the reason', async () => {
    const { service } = build({ member: true });

    await expect(service.recommendEligibility(PLAYER_ID)).resolves.toEqual({
      canRecommend: false,
      reason: 'IN_ACADEMY',
    });
  });

  it('names an open trial as the reason', async () => {
    const { service } = build({ application: true });

    await expect(service.recommendEligibility(PLAYER_ID)).resolves.toEqual({
      canRecommend: false,
      reason: 'IN_TRIAL',
    });
  });

  /* Both at once is the membership: it is the more permanent of the two. */
  it('prefers the academy over the trial when both apply', async () => {
    const { service } = build({ member: true, application: true });

    await expect(service.recommendEligibility(PLAYER_ID)).resolves.toMatchObject({
      reason: 'IN_ACADEMY',
    });
  });

  /* A local team is not an academy (TRIAL.md §5): its players stay open to
     scouts, so the membership lookup asks for academies only. */
  it('does not count a local-team membership', async () => {
    const { service, prisma } = build();

    await service.recommendEligibility(PLAYER_ID);

    expect(prisma.academyMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: PLAYER_USER,
          role: 'PLAYER',
          academy: { kind: 'ACADEMY' },
        }),
      }),
    );
  });

  /* Applied, invited, confirmed, passed and offered a place are all "in an
     academy's hands"; failed and rejected are over. */
  it('counts only the open application statuses', async () => {
    const { service, prisma } = build();

    await service.recommendEligibility(PLAYER_ID);

    const [call] = prisma.trialApplication.findFirst.mock.calls[0];
    expect([...call.where.status.in].sort()).toEqual(
      ['ACCEPTED', 'APPLIED', 'CONFIRMED', 'INVITED', 'PASSED'].sort(),
    );
    expect(call.where.status.in).not.toContain('FAILED');
    expect(call.where.status.in).not.toContain('REJECTED');
  });

  it('is a 404 for a player that does not exist', async () => {
    const { service, prisma } = build();
    prisma.playerProfile.findUnique.mockResolvedValue(null);

    await expect(service.recommendEligibility('nobody')).rejects.toThrow(NotFoundException);
  });
});

describe('create — the same rule at the door', () => {
  it('refuses a player already at an academy', async () => {
    const { service, prisma } = build({ member: true });

    await expect(
      service.create('scout-1', { playerId: PLAYER_ID, type: 'GLOBAL' } as never),
    ).rejects.toThrow(ConflictException);
    expect(prisma.recommendation.findFirst).not.toHaveBeenCalled();
  });

  it('refuses a player in a trial process', async () => {
    const { service, prisma } = build({ application: true });

    await expect(
      service.create('scout-1', { playerId: PLAYER_ID, type: 'GLOBAL' } as never),
    ).rejects.toThrow(/trial process/);
    expect(prisma.recommendation.findFirst).not.toHaveBeenCalled();
  });
});
