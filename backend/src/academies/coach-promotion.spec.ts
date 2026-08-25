import { AcademiesService } from './academies.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Being on the staff as a coach *is* the academy's endorsement.
 *
 * Three writers put somebody on an academy's staff: `createForAcademy`,
 * accepting a staff invitation, and this one. The first two write the
 * membership, the coach profile and the endorsement together, because all three
 * say the same thing — the academy vouches for this person as a coach.
 *
 * `updateMember` did not. A manager promoting a scout to coach produced
 * somebody the squad list called a coach and every review path refused, with an
 * error about the *academy* having no coaches. The person was in the squad; the
 * rows that make that mean anything were missing.
 */

const ACADEMY = 'academy-1';
const MEMBER = 'member-1';
const USER = 'user-1';

function build(member: Record<string, unknown>) {
  const tx = {
    academyMember: {
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: MEMBER,
        userId: USER,
        academyId: ACADEMY,
        coachId: null,
        status: 'ACTIVE',
        ...member,
        ...data,
      })),
    },
    coachProfile: { upsert: jest.fn(async () => ({ id: 'coach-profile-1' })) },
    academyEndorsement: {
      upsert: jest.fn(async (_args: { where: Record<string, any> }) => ({})),
      updateMany: jest.fn(async (_args: { where: Record<string, any> }) => ({})),
    },
    userRole: { createMany: jest.fn(async () => ({})) },
    role: { findUnique: jest.fn(async () => ({ id: 'role-1' })) },
  };

  const prisma = {
    $transaction: jest.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
    academyMember: {
      findUnique: jest.fn(async () => ({
        id: MEMBER,
        academyId: ACADEMY,
        userId: USER,
        ...member,
      })),
    },
  };

  const service = Object.create(AcademiesService.prototype) as AcademiesService;
  const wired = service as unknown as Record<string, unknown>;
  wired.prisma = prisma as unknown as PrismaService;
  wired.assertManager = async () => undefined;
  wired.invalidate = async () => undefined;
  wired.audit = { record: async () => undefined };
  wired.roleId = async () => 'role-1';

  return { service, tx };
}

/** What the endorsement table was told, for one role. */
const endorsementFor = (tx: ReturnType<typeof build>['tx'], role: string) => ({
  granted: tx.academyEndorsement.upsert.mock.calls.some(
    ([args]) => args.where.academyId_userId_role.role === role,
  ),
  revoked: tx.academyEndorsement.updateMany.mock.calls.some(([args]) => args.where.role === role),
});

describe('promoting a member to coach', () => {
  it('endorses them, so the reviews they are handed can actually be opened', async () => {
    const { service, tx } = build({ role: 'SCOUT' });
    await service.updateMember('manager-1', ACADEMY, MEMBER, { role: 'COACH' });

    expect(endorsementFor(tx, 'COACH').granted).toBe(true);
  });

  it('gives them a coach profile, which every review path asks for by name', async () => {
    const { service, tx } = build({ role: 'SCOUT' });
    await service.updateMember('manager-1', ACADEMY, MEMBER, { role: 'COACH' });

    expect(tx.coachProfile.upsert).toHaveBeenCalled();
    // And links it to the membership, which is what the squad list reads.
    expect(tx.academyMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { coachId: 'coach-profile-1' } }),
    );
  });

  it('gives them the coach role on their account', async () => {
    const { service, tx } = build({ role: 'SCOUT' });
    await service.updateMember('manager-1', ACADEMY, MEMBER, { role: 'COACH' });

    expect(tx.userRole.createMany).toHaveBeenCalled();
  });

  /* All of it in one transaction: a half-promoted coach is the bug being fixed. */
  it('writes the whole promotion or none of it', async () => {
    const { service } = build({ role: 'SCOUT' });
    const wired = service as unknown as { prisma: { $transaction: jest.Mock } };
    await service.updateMember('manager-1', ACADEMY, MEMBER, { role: 'COACH' });

    expect(wired.prisma.$transaction).toHaveBeenCalled();
  });
});

describe('taking the role away again', () => {
  /*
   * The mirror of `releaseMember`, which revokes on expulsion for the same
   * reason: a coach the academy has stood down must not keep the authority to
   * judge players for it.
   */
  it('revokes the endorsement when the role changes to something else', async () => {
    const { service, tx } = build({ role: 'COACH' });
    await service.updateMember('manager-1', ACADEMY, MEMBER, { role: 'SCOUT' });

    expect(endorsementFor(tx, 'COACH').revoked).toBe(true);
    // And grants the scout one, because that is what they now are.
    expect(endorsementFor(tx, 'SCOUT').granted).toBe(true);
  });

  it('revokes it when the coach is stood down to INACTIVE', async () => {
    const { service, tx } = build({ role: 'COACH' });
    await service.updateMember('manager-1', ACADEMY, MEMBER, { status: 'INACTIVE' });

    expect(endorsementFor(tx, 'COACH').revoked).toBe(true);
    expect(endorsementFor(tx, 'COACH').granted).toBe(false);
  });

  /*
   * `updateMany` rather than an upsert on the revoke side: upserting would
   * create a REVOKED row for every role the person has never held, which is a
   * table full of statements about things that never happened.
   */
  it('does not invent a revoked endorsement for a role never held', async () => {
    const { service, tx } = build({ role: 'COACH' });
    await service.updateMember('manager-1', ACADEMY, MEMBER, { status: 'INACTIVE' });

    const [args] = tx.academyEndorsement.updateMany.mock.calls[0] ?? [];
    if (!args) throw new Error('nothing was revoked');
    expect(args.where.status).toBe('ACTIVE');
  });
});
