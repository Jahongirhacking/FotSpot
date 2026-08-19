import { RecommendationsService } from './recommendations.service';

/**
 * What a manager's panel is told about a player, and how that differs by the kind
 * of organisation they run.
 *
 * A verified academy gets the coach/review/trial pipeline it has always had. A
 * local team has none of it (LOCAL_TEAM.md §6–§8) and gets the squad instead —
 * which is the whole reason its manager was being shown a "Send for review"
 * button that the API answers with 403.
 *
 * The regression guarded hardest here is §24: the verified-academy shape must not
 * change. Every field it returned before is still returned, still computed the
 * same way.
 */

const PLAYER_ID = 'player-profile-1';
const PLAYER_USER = 'player-user-1';
const ACADEMY_ID = 'academy-1';

function build(
  kind: 'ACADEMY' | 'LOCAL_TEAM',
  overrides: { member?: { status: string } | null; pendingInvite?: boolean } = {},
) {
  const prisma = {
    academyMember: {
      findFirst: jest.fn(async (): Promise<unknown> => ({
        academyId: ACADEMY_ID,
        academy: { id: ACADEMY_ID, name: 'Yoshlik', kind },
      })),
      findUnique: jest.fn(async (): Promise<unknown> => overrides.member ?? null),
    },
    academyInvitation: {
      findFirst: jest.fn(async (): Promise<unknown> =>
        overrides.pendingInvite ? { id: 'invite-1' } : null,
      ),
    },
    playerProfile: {
      findUnique: jest.fn(async (): Promise<unknown> => ({ userId: PLAYER_USER })),
    },
    recommendationTarget: { findFirst: jest.fn(async (): Promise<unknown> => null) },
    recommendationReview: { findUnique: jest.fn(async (): Promise<unknown> => null) },
    trialApplication: { findFirst: jest.fn(async (): Promise<unknown> => null) },
    academyEndorsement: { count: jest.fn(async () => 2) },
  };

  const service = Object.create(RecommendationsService.prototype) as RecommendationsService;
  (service as unknown as { prisma: unknown }).prisma = prisma;

  return { service, prisma };
}

describe('academyStateFor — a local team manager', () => {
  it('is told which kind of organisation they run', async () => {
    const { service } = build('LOCAL_TEAM');

    const state = await service.academyStateFor('manager-1', PLAYER_ID);

    expect(state?.academy.kind).toBe('LOCAL_TEAM');
  });

  /*
   * The bug this fixes. A null review beside `hasCoaches: false` is exactly the
   * shape the panel read as "send this player for review", and the endpoint
   * behind that button refuses a local team with 403.
   */
  it('is offered no review, trial or coach pipeline at all', async () => {
    const { service } = build('LOCAL_TEAM');

    const state = await service.academyStateFor('manager-1', PLAYER_ID);

    expect(state?.review).toBeNull();
    expect(state?.invitation).toBeNull();
    expect(state?.hasCoaches).toBe(false);
  });

  it('does not even look the pipeline up', async () => {
    const { service, prisma } = build('LOCAL_TEAM');

    await service.academyStateFor('manager-1', PLAYER_ID);

    expect(prisma.recommendationReview.findUnique).not.toHaveBeenCalled();
    expect(prisma.trialApplication.findFirst).not.toHaveBeenCalled();
    expect(prisma.academyEndorsement.count).not.toHaveBeenCalled();
  });

  /* The squad is the shared half, and for a local team it is the only half. */
  it('is given the squad state instead, addressed by user id', async () => {
    const { service } = build('LOCAL_TEAM');

    const state = await service.academyStateFor('manager-1', PLAYER_ID);

    expect(state?.squad).toEqual({
      userId: PLAYER_USER,
      status: null,
      invitationPending: false,
    });
  });

  it('reports a player already in the squad', async () => {
    const { service } = build('LOCAL_TEAM', { member: { status: 'ACTIVE' } });

    const state = await service.academyStateFor('manager-1', PLAYER_ID);

    expect(state?.squad?.status).toBe('ACTIVE');
  });

  /* "Was here, is not now" is a squad they can be invited back into. */
  it('treats a released member as invitable again', async () => {
    const { service } = build('LOCAL_TEAM', { member: { status: 'RELEASED' } });

    const state = await service.academyStateFor('manager-1', PLAYER_ID);

    expect(state?.squad?.status).toBeNull();
  });

  it('reports an invitation already waiting on an answer', async () => {
    const { service } = build('LOCAL_TEAM', { pendingInvite: true });

    const state = await service.academyStateFor('manager-1', PLAYER_ID);

    expect(state?.squad?.invitationPending).toBe(true);
  });

  /*
   * A recommendation still reaches a local team — scouts recommend into one and
   * the manager should see it. What must not happen is the *evaluation* pipeline
   * (LOCAL_TEAM.md §11), and that is what the assertions above cover.
   */
  it('still reports a scout recommendation', async () => {
    const { service, prisma } = build('LOCAL_TEAM');
    prisma.recommendationTarget.findFirst.mockResolvedValue({
      status: 'PENDING',
      recommendationId: 'rec-1',
      recommendation: { note: 'quick', scout: { id: 's1', firstName: 'A', lastName: 'B' } },
    });

    const state = await service.academyStateFor('manager-1', PLAYER_ID);

    expect(state?.recommendation).toEqual(expect.objectContaining({ id: 'rec-1' }));
  });
});

describe('academyStateFor — a verified academy is unchanged (LOCAL_TEAM.md §24)', () => {
  it('still looks up the review, the trial invitation and the coaches', async () => {
    const { service, prisma } = build('ACADEMY');

    const state = await service.academyStateFor('manager-1', PLAYER_ID);

    expect(prisma.recommendationReview.findUnique).toHaveBeenCalled();
    expect(prisma.trialApplication.findFirst).toHaveBeenCalled();
    expect(state?.hasCoaches).toBe(true);
  });

  it('keeps every field the panel already read', async () => {
    const { service } = build('ACADEMY');

    const state = await service.academyStateFor('manager-1', PLAYER_ID);

    expect(state).toEqual(
      expect.objectContaining({
        academy: expect.objectContaining({ id: ACADEMY_ID, name: 'Yoshlik' }),
        recommendation: null,
        review: null,
        invitation: null,
        hasCoaches: true,
      }),
    );
  });

  it('returns null when the caller manages nothing', async () => {
    const { service, prisma } = build('ACADEMY');
    prisma.academyMember.findFirst.mockResolvedValue(null);

    await expect(service.academyStateFor('nobody', PLAYER_ID)).resolves.toBeNull();
  });
});
