import { PlayersService } from './players.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

/**
 * Who is told how to reach a player.
 *
 * An academy's manager, and nobody else: not a scout, not a coach, not
 * another player, not a guest. The contacts are resolved beside the cached
 * profile rather than inside it, so the shared cache never carries a phone
 * number — the cache is the same bytes for everybody.
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
  media: [],
  user: {},
};

function build(managerFor: string | null) {
  const prisma = {
    playerProfile: {
      findUnique: jest.fn(async (args: { select?: unknown }): Promise<unknown> =>
        args.select ? OWNER : PROFILE,
      ),
    },
    academyMember: {
      findFirst: jest.fn(async (args: { where: { userId: string; role?: unknown } }) =>
        managerFor && args.where.userId === managerFor && args.where.role === 'MANAGER'
          ? { id: 'membership-1' }
          : null,
      ),
      findMany: jest.fn(async () => []),
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
  it("gives an academy's manager the email, phone and a Telegram link", async () => {
    const { service } = build('manager-1');

    const profile = await service.getPublicProfile(
      'player-1',
      viewer('manager-1', ['academy_manager']),
    );

    expect(profile.contacts).toEqual({
      email: 'kid@example.test',
      phone: '+998901234567',
      telegram: 'tg://user?id=123456',
    });
  });

  it('gives a guest nothing, and asks for nothing', async () => {
    const { service, prisma } = build(null);

    const profile = await service.getPublicProfile('player-1');

    expect(profile.contacts).toBeNull();
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
