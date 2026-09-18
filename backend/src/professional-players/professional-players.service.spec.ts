import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ProfessionalPlayersService } from './professional-players.service';

/**
 * Who may write the professionals directory, and who may claim its players
 * for an academy. The button is a clarity decision; these are the boundary.
 */

const ACADEMY_ID = 'academy-1';
const MANAGER_ID = 'manager-1';
const OTHER_MANAGER_ID = 'manager-2';

function build(
  overrides: { membershipRole?: 'MANAGER' | 'COACH' | null; knownPlayers?: number } = {},
) {
  const prisma = {
    academyMember: {
      findUnique: jest.fn(async (): Promise<unknown> =>
        overrides.membershipRole === null || overrides.membershipRole === undefined
          ? null
          : { role: overrides.membershipRole },
      ),
    },
    academyProfile: {
      findUnique: jest.fn(async (): Promise<unknown> => ({ id: ACADEMY_ID })),
      count: jest.fn(async () => 1),
    },
    professionalPlayer: {
      count: jest.fn(async () => overrides.knownPlayers ?? 2),
      findMany: jest.fn(async (): Promise<unknown[]> => []),
      // The row as Prisma returns it: the nested `create` became join rows.
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'pro-1',
        avatarKey: null,
        ...data,
        academies: [],
      })),
    },
    professionalPlayerAcademy: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({ count: 2 })),
    },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const storage = { publicUrlOrNull: jest.fn(() => null) };

  const service = Object.create(ProfessionalPlayersService.prototype) as ProfessionalPlayersService;
  Object.assign(service, { prisma, audit, storage });
  return { service, prisma, audit };
}

describe('claiming professionals for an academy', () => {
  it("lets the academy's manager replace the set", async () => {
    const { service, prisma } = build({ membershipRole: 'MANAGER' });

    await service.setForAcademy(MANAGER_ID, ACADEMY_ID, ['pro-1', 'pro-2', 'pro-1'], false);

    // De-duplicated, and the whole set written: what is not in the list goes.
    expect(prisma.professionalPlayerAcademy.deleteMany).toHaveBeenCalledWith({
      where: { academyId: ACADEMY_ID, professionalPlayerId: { notIn: ['pro-1', 'pro-2'] } },
    });
    expect(prisma.professionalPlayerAcademy.createMany).toHaveBeenCalledWith({
      data: [
        { academyId: ACADEMY_ID, professionalPlayerId: 'pro-1' },
        { academyId: ACADEMY_ID, professionalPlayerId: 'pro-2' },
      ],
      skipDuplicates: true,
    });
  });

  it('refuses a manager of a different academy, and a coach of this one', async () => {
    const stranger = build({ membershipRole: null });
    await expect(
      stranger.service.setForAcademy(OTHER_MANAGER_ID, ACADEMY_ID, ['pro-1'], false),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(stranger.prisma.professionalPlayerAcademy.createMany).not.toHaveBeenCalled();

    const coach = build({ membershipRole: 'COACH' });
    await expect(
      coach.service.setForAcademy('coach-1', ACADEMY_ID, ['pro-1'], false),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an admin correct any academy without a membership', async () => {
    const { service, prisma } = build({ membershipRole: null });

    await service.setForAcademy('admin-1', ACADEMY_ID, ['pro-1', 'pro-2'], true);

    expect(prisma.academyMember.findUnique).not.toHaveBeenCalled();
    expect(prisma.professionalPlayerAcademy.createMany).toHaveBeenCalled();
  });

  it('refuses an id that is not a professional player', async () => {
    const { service } = build({ membershipRole: 'MANAGER', knownPlayers: 1 });

    await expect(
      service.setForAcademy(MANAGER_ID, ACADEMY_ID, ['pro-1', 'nobody'], false),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('creating a professional player', () => {
  it('needs both names', async () => {
    const { service, prisma } = build();

    await expect(
      service.create('admin-1', { firstName: ' ', lastName: 'Shomurodov' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.professionalPlayer.create).not.toHaveBeenCalled();
  });

  it('writes the academies as join rows, de-duplicated', async () => {
    const { service, prisma } = build();
    prisma.academyProfile.count.mockResolvedValueOnce(1);

    const player = await service.create('admin-1', {
      firstName: ' Eldor ',
      lastName: 'Shomurodov',
      position: 'ST',
      dominantFoot: 'RIGHT',
      academyIds: [ACADEMY_ID, ACADEMY_ID],
    });

    expect(prisma.professionalPlayer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstName: 'Eldor',
          lastName: 'Shomurodov',
          position: 'ST',
          dominantFoot: 'RIGHT',
          academies: { create: [{ academyId: ACADEMY_ID }] },
        }),
      }),
    );
    expect(player).toMatchObject({ id: 'pro-1', avatarUrl: null, academies: [] });
  });
});
