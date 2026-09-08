import { RecommendationsService } from './recommendations.service';

/**
 * What the profile panel is told about a player, and how that differs by the
 * kind of organisation the viewer works for and what they are to it.
 *
 * A verified academy gets the private-trial pipeline. A local team has none of
 * it (LOCAL_TEAM.md §6–§8) and gets the squad instead — which is the whole
 * reason its manager was once shown a button the API answers with 403.
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
  overrides: {
    member?: { status: string } | null;
    pendingInvite?: boolean;
    /** What the viewer is to the academy. `null` stands with none. */
    viewer?: 'MANAGER' | 'COACH' | null;
  } = {},
) {
  const viewer = overrides.viewer === undefined ? 'MANAGER' : overrides.viewer;
  const prisma = {
    academyMember: {
      // Asked as a manager first, then as an endorsed coach — see `viewerAcademy`.
      findFirst: jest.fn(async (args: { where: { role: string } }): Promise<unknown> =>
        args.where.role === viewer
          ? { academyId: ACADEMY_ID, academy: { id: ACADEMY_ID, name: 'Yoshlik', kind } }
          : null,
      ),
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
   * The bug this fixes. `hasCoaches: false` beside a null invitation is exactly
   * the shape the panel reads as "invite this player", and the endpoint behind
   * that button refuses a local team with 403.
   */
  it('is offered no trial or coach pipeline at all', async () => {
    const { service } = build('LOCAL_TEAM');

    const state = await service.academyStateFor('manager-1', PLAYER_ID);

    expect(state?.invitation).toBeNull();
    expect(state?.hasCoaches).toBe(false);
  });

  it('does not even look the pipeline up', async () => {
    const { service, prisma } = build('LOCAL_TEAM');

    await service.academyStateFor('manager-1', PLAYER_ID);

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
  it('still looks up the trial invitation and the coaches', async () => {
    const { service, prisma } = build('ACADEMY');

    const state = await service.academyStateFor('manager-1', PLAYER_ID);

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
        invitation: null,
        hasCoaches: true,
      }),
    );
  });

  it('returns null when the caller manages nothing', async () => {
    const { service } = build('ACADEMY', { viewer: null });

    await expect(service.academyStateFor('nobody', PLAYER_ID)).resolves.toBeNull();
  });

  it('says the viewer is the manager', async () => {
    const { service } = build('ACADEMY');

    const state = await service.academyStateFor('manager-1', PLAYER_ID);

    expect(state?.role).toBe('MANAGER');
  });
});

/**
 * A coach may invite a player to a private trial (TRIAL.md §11), so their
 * profile panel needs the same answer — and needs to know it is a coach
 * reading it, because a coach names no other coach to run the session.
 */
describe('academyStateFor — an endorsed coach', () => {
  it('gets the academy state, marked as the coach', async () => {
    const { service, prisma } = build('ACADEMY', { viewer: 'COACH' });

    const state = await service.academyStateFor('coach-1', PLAYER_ID);

    expect(state?.role).toBe('COACH');
    expect(state?.academy.id).toBe(ACADEMY_ID);
    expect(prisma.trialApplication.findFirst).toHaveBeenCalled();
  });

  /* The coach asking is the one who would run it; nobody has to be counted. */
  it('is somebody to run a trial, without counting the staff', async () => {
    const { service, prisma } = build('ACADEMY', { viewer: 'COACH' });
    prisma.academyEndorsement.count.mockResolvedValue(0);

    const state = await service.academyStateFor('coach-1', PLAYER_ID);

    expect(state?.hasCoaches).toBe(true);
    expect(prisma.academyEndorsement.count).not.toHaveBeenCalled();
  });

  /* Only an *endorsed* coach speaks for the academy — the query says so. */
  it('is only recognised through an active endorsement', async () => {
    const { service, prisma } = build('ACADEMY', { viewer: 'COACH' });

    await service.academyStateFor('coach-1', PLAYER_ID);

    const asCoach = prisma.academyMember.findFirst.mock.calls.find(
      ([args]) => args.where.role === 'COACH',
    );
    expect(asCoach?.[0].where).toEqual(
      expect.objectContaining({
        status: 'ACTIVE',
        academy: {
          endorsements: { some: { userId: 'coach-1', role: 'COACH', status: 'ACTIVE' } },
        },
      }),
    );
  });
});
