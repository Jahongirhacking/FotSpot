import { PlayersService } from './players.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

/**
 * Who is told how to reach a player.
 *
 * The manager of an academy the player is *with* — in its squad, or in one
 * of its trials right now — and nobody else: not another academy's manager,
 * not a scout, not a coach, not another player, not a guest. A manager with
 * no such tie is told what would open it (an invitation), not the number.
 * The contacts are resolved beside the cached profile rather than inside it,
 * so the shared cache never carries a phone number — the cache is the same
 * bytes for everybody.
 */

const OWNER = { userId: 'player-user-1', user: { isPrivate: false } };
const BORN = new Date(new Date().getFullYear() - 15, 2, 15);
const PROFILE = {
  id: 'player-1',
  firstName: 'A',
  lastName: 'B',
  birthDate: BORN,
  region: 'Toshkent shahri',
  district: 'Yunusobod',
  instagramUrl: 'https://instagram.com/kid',
  telegramUrl: null,
  youtubeUrl: 'https://youtube.com/@kid',
  transfermarktUrl: null,
  contactPhone: '+998971112233',
  media: [],
  user: {},
};

/**
 * `managerFor` is the user who manages academy-1. `tie` is what the player is
 * to that academy: in its squad, in one of its open trials, or nothing.
 */
function build(managerFor: string | null, tie: 'SQUAD' | 'TRIAL' | 'NONE' = 'SQUAD') {
  const prisma = {
    playerProfile: {
      findUnique: jest.fn(async (args: { select?: unknown }): Promise<unknown> =>
        args.select ? OWNER : PROFILE,
      ),
    },
    academyMember: {
      // Asked two ways: is the viewer a manager (userId + role MANAGER), and is
      // the player in the manager's squad (role PLAYER + academyId in).
      findFirst: jest.fn(
        async (args: {
          where: { userId?: string; role?: unknown; academyId?: unknown };
        }): Promise<unknown> => {
          if (args.where.role === 'MANAGER') {
            return managerFor && args.where.userId === managerFor ? { id: 'membership-1' } : null;
          }
          if (args.where.role === 'PLAYER') return tie === 'SQUAD' ? { id: 'member-1' } : null;
          return null;
        },
      ),
      // The academies the viewer manages; the memberships list is elsewhere.
      findMany: jest.fn(async (args: { where: { role?: unknown } }): Promise<unknown[]> =>
        args.where.role === 'MANAGER' && managerFor ? [{ academyId: 'academy-1' }] : [],
      ),
    },
    trialApplication: {
      findFirst: jest.fn(async (): Promise<unknown> => (tie === 'TRIAL' ? { id: 'app-1' } : null)),
    },
    user: {
      findUnique: jest.fn(async () => ({
        email: 'kid@example.test',
        phone: '+998901234567',
        telegramId: '123456',
      })),
    },
  };
  const service = Object.create(PlayersService.prototype) as PlayersService;
  Object.assign(service as unknown as Record<string, unknown>, {
    prisma,
    redis: { wrap: async (_k: string, _t: number, run: () => Promise<unknown>) => run() },
    storage: { publicUrlOrNull: () => null },
    starsFor: async () => new Map(),
    withAvatar: (row: unknown) => row,
    membershipsFor: async () => ({ current: null, academyHistory: [] }),
  });
  return { service, prisma };
}

const viewer = (userId: string, roles: string[] = ['player']): AuthUser =>
  ({ userId, roles, permissions: [] }) as unknown as AuthUser;

describe('getPublicProfile — what a viewer is told about a player', () => {
  it("gives the manager of the player's own academy the email, phone, Telegram and social links", async () => {
    const { service } = build('manager-1', 'SQUAD');

    const profile = await service.getPublicProfile(
      'player-1',
      viewer('manager-1', ['academy_manager']),
    );

    expect(profile.contactAccess).toBe('GRANTED');
    expect(profile.contacts).toEqual({
      email: 'kid@example.test',
      phone: '+998901234567',
      telegram: 'tg://user?id=123456',
      contactPhone: '+998971112233',
      social: {
        instagramUrl: 'https://instagram.com/kid',
        telegramUrl: null,
        youtubeUrl: 'https://youtube.com/@kid',
        transfermarktUrl: null,
      },
    });
  });

  it('opens the contacts to a manager whose academy has the player in an open trial', async () => {
    const { service, prisma } = build('manager-1', 'TRIAL');

    const profile = await service.getPublicProfile(
      'player-1',
      viewer('manager-1', ['academy_manager']),
    );

    expect(profile.contactAccess).toBe('GRANTED');
    expect(profile.contacts?.phone).toBe('+998901234567');
    // Only an application still open, on a trial still open.
    expect(prisma.trialApplication.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          playerId: 'player-1',
          status: { in: ['APPLIED', 'INVITED', 'CONFIRMED', 'PASSED', 'ACCEPTED'] },
          trial: { academyId: { in: ['academy-1'] }, status: 'OPEN' },
        }),
      }),
    );
  });

  /* The rule the card enforces: no tie, no number — and the way to a tie is named. */
  it('tells a manager with no tie to the player to invite them first, and gives nothing', async () => {
    const { service, prisma } = build('manager-1', 'NONE');

    const profile = await service.getPublicProfile(
      'player-1',
      viewer('manager-1', ['academy_manager']),
    );

    expect(profile.contactAccess).toBe('INVITE_TO_UNLOCK');
    expect(profile.contacts).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('never puts the social links on the shared profile itself', async () => {
    const { service } = build('manager-1', 'NONE');

    const asManager = await service.getPublicProfile(
      'player-1',
      viewer('manager-1', ['academy_manager']),
    );
    const asGuest = await service.getPublicProfile('player-1');

    for (const profile of [asManager, asGuest] as Record<string, unknown>[]) {
      expect(profile).not.toHaveProperty('instagramUrl');
      expect(profile).not.toHaveProperty('youtubeUrl');
      expect(profile).not.toHaveProperty('telegramUrl');
      expect(profile).not.toHaveProperty('transfermarktUrl');
      expect(profile).not.toHaveProperty('contactPhone');
    }
  });

  it('gives a guest nothing, and asks for nothing', async () => {
    const { service, prisma } = build(null);

    const profile = await service.getPublicProfile('player-1');

    expect(profile.contacts).toBeNull();
    expect(profile.contactAccess).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['a scout', 'scout'],
    ['a coach', 'coach'],
    ['another player', 'player'],
  ])('gives %s nothing', async (_who, role) => {
    const { service, prisma } = build(null);

    const profile = await service.getPublicProfile('player-1', viewer('viewer-1', [role]));

    expect(profile.contacts).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  /* Redis hands the cached profile back with the date as a string; the band
     must still come out right. */
  it('computes the band from a cached (string) date of birth too', async () => {
    const { service, prisma } = build(null);
    prisma.playerProfile.findUnique.mockImplementation(async (args: { select?: unknown }) =>
      args.select ? OWNER : { ...PROFILE, birthDate: BORN.toISOString() },
    );

    const profile = await service.getPublicProfile('player-1');

    expect(profile.ageBand).toBe('U16');
  });

  /* The band, not the birthday, and no address — for anybody but a manager. */
  it('tells a stranger the age band and withholds the date of birth and address', async () => {
    const { service } = build(null);

    const profile = await service.getPublicProfile('player-1', viewer('viewer-1', ['scout']));

    expect(profile.ageBand).toBe('U16');
    expect(profile.birthDate).toBeNull();
    expect(profile.region).toBeNull();
    expect(profile.district).toBeNull();
    expect(profile.details).toBeNull();
  });

  it("gives an academy's manager the exact date, the age and the address", async () => {
    const { service } = build('manager-1');

    const profile = await service.getPublicProfile(
      'player-1',
      viewer('manager-1', ['academy_manager']),
    );

    expect(profile.birthDate).toEqual(BORN);
    expect(profile.details).toEqual({
      birthDate: BORN,
      age: 15,
      region: 'Toshkent shahri',
      district: 'Yunusobod',
    });
  });

  /* The role on the token is not enough: the membership row is what makes
     somebody an academy's manager, and a revoked one must close the door. */
  it('decides by the active manager membership, not the role claim', async () => {
    const { service } = build(null);

    const profile = await service.getPublicProfile(
      'player-1',
      viewer('was-a-manager', ['academy_manager']),
    );

    expect(profile.contacts).toBeNull();
  });
});
