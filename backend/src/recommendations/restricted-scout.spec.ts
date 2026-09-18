import { ForbiddenException } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';

/**
 * A restricted scout (README 1.13) writes no more recommendations and is not
 * heard in public. Enforced in the service: the hidden button is a clarity
 * decision, the 403 is the boundary, and the public list filters on the
 * scout's row, not on anything the client sends.
 */

const PLAYER_ID = 'player-profile-1';
const SCOUT_ID = 'scout-1';

function build(restricted: boolean) {
  const prisma = {
    playerProfile: {
      findUnique: jest.fn(async (): Promise<unknown> => ({ id: PLAYER_ID, userId: 'player-user' })),
    },
    user: {
      findUnique: jest.fn(async (): Promise<unknown> => ({
        restrictedAt: restricted ? new Date('2026-09-01') : null,
      })),
    },
    academyMember: { findFirst: jest.fn(async (): Promise<unknown> => null) },
    trialApplication: { findFirst: jest.fn(async (): Promise<unknown> => null) },
    recommendation: {
      findFirst: jest.fn(async (): Promise<unknown> => null),
      findMany: jest.fn(async (): Promise<unknown[]> => []),
      count: jest.fn(async () => 0),
    },
    playerRecommendationWeight: { findUnique: jest.fn(async (): Promise<unknown> => null) },
  };
  const tariffs = { assertCanRecommend: jest.fn(async () => undefined) };
  const service = Object.create(RecommendationsService.prototype) as RecommendationsService;
  Object.assign(service, { prisma, tariffs });
  return { service, prisma, tariffs };
}

describe('a restricted scout', () => {
  it('is refused before any other rule is consulted', async () => {
    const { service, prisma, tariffs } = build(true);

    await expect(
      service.create(SCOUT_ID, { playerId: PLAYER_ID, type: 'GLOBAL' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.recommendation.findFirst).not.toHaveBeenCalled();
    expect(tariffs.assertCanRecommend).not.toHaveBeenCalled();
  });

  it('is told about their own standing by the eligibility check', async () => {
    const { service } = build(true);

    await expect(service.recommendEligibility(PLAYER_ID, SCOUT_ID)).resolves.toEqual({
      canRecommend: false,
      reason: 'SCOUT_RESTRICTED',
    });
  });

  it('does not stand in the way of an unrestricted scout', async () => {
    const { service } = build(false);

    await expect(service.recommendEligibility(PLAYER_ID, SCOUT_ID)).resolves.toEqual({
      canRecommend: true,
      reason: null,
    });
  });
});

describe('the public recommendation list', () => {
  it('reads only unrestricted scouts, most credible first, one page at a time', async () => {
    const { service, prisma } = build(false);
    prisma.recommendation.count.mockResolvedValueOnce(7);

    const summary = await service.playerRecommendationSummary(PLAYER_ID, { page: 2, pageSize: 3 });

    const where = { playerId: PLAYER_ID, clearedAt: null, scout: { restrictedAt: null } };
    expect(prisma.recommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ scoutWeight: 'desc' }, { createdAt: 'desc' }],
        skip: 3,
        take: 3,
      }),
    );
    expect(prisma.recommendation.count).toHaveBeenCalledWith({ where });
    expect(summary).toMatchObject({ total: 7, page: 2, pageSize: 3, scouts: [] });
  });
});
