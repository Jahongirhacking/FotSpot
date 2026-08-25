import { TrialsService } from './trials.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';

/**
 * Who may see an academy's private trials.
 *
 * A private trial exists for one named child. Its title is generated as
 * `Private trial — <player name>`, and the page it appears on carries the date
 * and the place too. `GET /trials/academy/:id` is `@Public()`, and it used to
 * return them to anybody — so an anonymous request for an academy answered with
 * the children it had invited, where each of them would be, and when.
 *
 * These are about the **query**, not the rendering. Hiding the section in the UI
 * would have left the JSON saying it, which is what was actually wrong.
 */

const ACADEMY = 'academy-1';

function build(staff: unknown) {
  const prisma = {
    academyMember: {
      findFirst: jest.fn(
        async (_args: { where: Record<string, unknown> }): Promise<unknown> => staff,
      ),
    },
    trial: { findMany: jest.fn(async (_args: { where: Record<string, unknown> }) => []) },
  };

  const service = Object.create(TrialsService.prototype) as TrialsService;
  const wired = service as unknown as { prisma: PrismaService; storage: StorageService };
  wired.prisma = prisma as unknown as PrismaService;
  wired.storage = { publicUrlOrNull: () => null } as unknown as StorageService;

  return { service, prisma };
}

/** The `where` the service actually asked Postgres for. */
async function whereFor(staff: unknown, viewerUserId?: string) {
  const { service, prisma } = build(staff);
  await service.listForAcademy(ACADEMY, viewerUserId);
  const [args] = prisma.trial.findMany.mock.calls[0] ?? [];
  if (!args) throw new Error('the service never queried for trials');
  return args.where;
}

describe('an academy’s trial list', () => {
  it('gives an anonymous visitor general trials only', async () => {
    const where = await whereFor(null);

    expect(where.type).toBe('GENERAL');
    expect(where.academyId).toBe(ACADEMY);
  });

  it('does not even ask who a signed-out visitor is', async () => {
    const { service, prisma } = build(null);
    await service.listForAcademy(ACADEMY, undefined);

    // No membership lookup for somebody who has no identity to look up.
    expect(prisma.academyMember.findFirst).not.toHaveBeenCalled();
  });

  it('gives a signed-in stranger general trials only', async () => {
    // A player, a scout, another academy's manager — no membership here.
    const where = await whereFor(null, 'somebody-else');

    expect(where.type).toBe('GENERAL');
  });

  it.each([['MANAGER'], ['COACH']])(
    'gives this academy’s own %s the private ones too',
    async () => {
      const where = await whereFor({ id: 'member-1' }, 'staff-1');

      // No type filter at all: staff see the whole board, which is the view the
      // manager's own trials screen is built from.
      expect(where.type).toBeUndefined();
      expect(where.academyId).toBe(ACADEMY);
    },
  );

  it('asks only about active staff of this academy', async () => {
    const { service, prisma } = build({ id: 'member-1' });
    await service.listForAcademy(ACADEMY, 'staff-1');

    const [args] = prisma.academyMember.findFirst.mock.calls[0] ?? [];
    if (!args) throw new Error('the service never checked who was asking');
    const { where } = args;
    expect(where.academyId).toBe(ACADEMY);
    expect(where.userId).toBe('staff-1');
    expect(where.status).toBe('ACTIVE');
    // A released coach is not staff any more, and a PLAYER member never was for
    // this purpose — being at the academy does not make somebody its office.
    expect(where.role).toEqual({ in: ['MANAGER', 'COACH'] });
  });

  it('never returns an archived trial to anybody', async () => {
    expect((await whereFor(null)).status).toBe('OPEN');
    expect((await whereFor({ id: 'member-1' }, 'staff-1')).status).toBe('OPEN');
  });
});
