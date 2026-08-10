import { ForbiddenException } from '@nestjs/common';
import { TariffsService } from './tariffs.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

/**
 * The four plan limits, at their boundaries.
 *
 * Every one of them is an inequality that decides whether somebody may act, and
 * the interesting cases are all one row apart: nine of ten allowed, ten of ten
 * refused. An off-by-one here is a player who cannot upload their tenth clip, or
 * a scout who can quietly file an eleventh — neither of which any other test in
 * the suite would notice.
 */

const PLAN = {
  tier: 'FREE' as const,
  clipLimit: 10,
  clipWindowDays: 7,
  pendingRecommendationLimit: 10,
  maxCoaches: 5,
  maxGroups: 5,
  updatedAt: new Date(),
};

interface Counts {
  media?: number;
  recommendations?: number;
  coaches?: number;
  groups?: number;
  /** Null models an account with no player profile — nothing to limit. */
  playerProfile?: { id: string } | null;
}

function build(counts: Counts = {}) {
  const prisma = {
    user: { findUnique: jest.fn(async () => ({ plan: PLAN })) },
    playerProfile: {
      findUnique: jest.fn(async () =>
        counts.playerProfile === undefined ? { id: 'player-1' } : counts.playerProfile,
      ),
    },
    media: {
      count: jest.fn(async () => counts.media ?? 0),
      findFirst: jest.fn(async () => ({ createdAt: new Date('2026-08-01T00:00:00Z') })),
    },
    recommendation: { count: jest.fn(async () => counts.recommendations ?? 0) },
    academyMember: { count: jest.fn(async () => counts.coaches ?? 0) },
    academyGroup: { count: jest.fn(async () => counts.groups ?? 0) },
  };

  const service = new TariffsService(
    prisma as unknown as PrismaService,
    { record: jest.fn() } as unknown as AuditService,
  );

  return { service, prisma };
}

describe('TariffsService — clip limit (A over B days)', () => {
  it('allows the upload that reaches the limit but not the one past it', async () => {
    await expect(build({ media: 9 }).service.assertCanUploadClip('u1')).resolves.toMatchObject({
      remaining: 1,
      exceeded: false,
    });

    await expect(build({ media: 10 }).service.assertCanUploadClip('u1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('tells a blocked player when a slot comes back', async () => {
    const { service } = build({ media: 10 });
    const quota = await service.clipQuota('u1');

    // The window is rolling, so the answer is when the *oldest* clip ages out —
    // seven days after it was uploaded, not at some shared reset moment.
    expect(quota.resetsAt).toEqual(new Date('2026-08-08T00:00:00Z'));
    expect(quota.windowDays).toBe(7);
  });

  it('counts nothing for an account with no player profile', async () => {
    const { service } = build({ playerProfile: null });
    await expect(service.clipQuota('u1')).resolves.toMatchObject({ used: 0, exceeded: false });
  });

  it('never reports negative headroom when a plan is lowered under existing use', async () => {
    // A super admin can move somebody from Premium to Free, which can leave them
    // over the new ceiling. "-4 left" is not something to show anybody.
    const { service } = build({ media: 14 });
    await expect(service.clipQuota('u1')).resolves.toMatchObject({ remaining: 0, exceeded: true });
  });
});

describe('TariffsService — pending recommendations (C)', () => {
  it('refuses the scout who is already at the cap, and allows the one below it', async () => {
    await expect(build({ recommendations: 9 }).service.assertCanRecommend('s1')).resolves
      .toMatchObject({ remaining: 1 });

    await expect(build({ recommendations: 10 }).service.assertCanRecommend('s1')).rejects
      .toBeInstanceOf(ForbiddenException);
  });

  /**
   * The slot is held by an undecided *target*, never by `Recommendation.status`.
   *
   * That column is only mirrored from the verdict for single-academy rows, so
   * reading it would leave a three-academy recommendation counted for ever once
   * all three had answered — a slot the scout could never get back. And a GLOBAL
   * recommendation has no targets at all, so it can never be answered and must
   * not occupy one.
   */
  it('asks the target rows, so a fully answered recommendation frees its slot', async () => {
    const { service, prisma } = build({ recommendations: 3 });
    await service.pendingRecommendationQuota('scout-1');

    expect(prisma.recommendation.count).toHaveBeenCalledWith({
      where: {
        scoutId: 'scout-1',
        clearedAt: null,
        targets: { some: { status: { in: ['PENDING', 'REVIEWING'] } } },
      },
    });
  });
});

describe('TariffsService — academy limits (D and E)', () => {
  it('refuses a sixth coach and a sixth group', async () => {
    await expect(build({ coaches: 5 }).service.assertCanAddCoach('m1', 'a1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      build({ groups: 5 }).service.assertCanCreateGroup('m1', 'a1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the fifth of each', async () => {
    await expect(build({ coaches: 4 }).service.assertCanAddCoach('m1', 'a1')).resolves.toMatchObject(
      { remaining: 1 },
    );
    await expect(
      build({ groups: 4 }).service.assertCanCreateGroup('m1', 'a1'),
    ).resolves.toMatchObject({ remaining: 1 });
  });

  it('does not count released members against the coach limit', async () => {
    const { service, prisma } = build({ coaches: 1 });
    await service.coachQuota('m1', 'a1');

    expect(prisma.academyMember.count).toHaveBeenCalledWith({
      where: { academyId: 'a1', role: 'COACH', status: { not: 'RELEASED' } },
    });
  });
});
