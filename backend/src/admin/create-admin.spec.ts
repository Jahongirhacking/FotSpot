import { ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AdminService } from './admin.service';
import { AuditAction } from '../audit/audit.actions';
import type { AcademiesService } from '../academies/academies.service';
import type { AuditService } from '../audit/audit.service';
import type { CoachesService } from '../coaches/coaches.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RbacService } from '../rbac/rbac.service';
import type { StorageService } from '../storage/storage.service';
import type { TariffsService } from '../tariffs/tariffs.service';

/**
 * Minting an admin account.
 *
 * Admins are staff the platform team hires, so the super admin types a name and
 * the platform issues the credentials — the same mechanism that onboards an
 * academy manager (§1.10), and deliberately not the role-grant-by-search it
 * replaced.
 *
 * The property worth guarding hardest is that the plaintext password exists in
 * exactly two places — the response, and nowhere else. Everything below is either
 * that, or the account being unusable without the role that makes it an admin.
 */

function build(overrides: { existingPhone?: boolean; takenUsernames?: number } = {}) {
  let usernameLookups = 0;

  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { phone?: string; username?: string } }) => {
        if (where.phone !== undefined) return overrides.existingPhone ? { id: 'someone' } : null;
        // Simulate the first N generated usernames already being taken.
        usernameLookups += 1;
        return usernameLookups <= (overrides.takenUsernames ?? 0) ? { id: 'clash' } : null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'new-admin-1',
        ...data,
      })),
    },
    // The service's callback form: run it against the same fake.
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };

  const rbac = { assignRole: jest.fn(async () => ({})) };
  const audit = { record: jest.fn(async () => undefined) };

  const service = new AdminService(
    prisma as unknown as PrismaService,
    { withAvatarUrl: (u: unknown) => u } as unknown as StorageService,
    rbac as unknown as RbacService,
    {} as unknown as CoachesService,
    {} as unknown as AcademiesService,
    {} as unknown as NotificationsService,
    audit as unknown as AuditService,
    {} as unknown as TariffsService,
  );

  return { service, prisma, rbac, audit };
}

const DTO = { firstName: 'Jahongir', lastName: 'Hayitov' };

describe('createAdmin — the platform issues the account', () => {
  it('returns a username and password for the super admin to hand over', async () => {
    const { service } = build();

    const result = await service.createAdmin('super-1', DTO);

    expect(result.credentials.username).toMatch(/^jahongirhayitov\.[23456789a-z]{4}$/);
    expect(result.credentials.password).toHaveLength(14);
  });

  /*
   * The username is derived from the name typed in, which is the whole point of
   * asking for one: a login of `admin.k3m9` identifies nobody six months later.
   */
  it('derives the username from the name it was given', async () => {
    const { service } = build();

    const result = await service.createAdmin('super-1', {
      firstName: 'Дилшод',
      lastName: 'Каримов',
    });

    expect(result.credentials.username).toMatch(/^dilshodkarimov\./);
  });

  it('falls back to "admin" when the name transliterates to nothing', async () => {
    const { service } = build();

    const result = await service.createAdmin('super-1', { firstName: '李', lastName: '王' });

    expect(result.credentials.username).toMatch(/^admin\.[23456789a-z]{4}$/);
  });

  /*
   * The one property this whole flow rests on. Only the hash is written, so
   * "resend their password" is impossible by construction — the sole recovery is
   * a reset, which is what `mustChangePassword` and the reset endpoint are for.
   */
  it('stores only a hash, never the password itself', async () => {
    const { service, prisma } = build();

    const result = await service.createAdmin('super-1', DTO);

    const [{ data }] = prisma.user.create.mock.calls[0] as unknown as [
      { data: Record<string, string> },
    ];
    expect(data).not.toHaveProperty('password');
    expect(data.passwordHash).not.toBe(result.credentials.password);
    await expect(argon2.verify(data.passwordHash, result.credentials.password)).resolves.toBe(true);
  });

  /* The password reached them via a chat app, so it is a handover, not a secret. */
  it('forces a password change on first sign-in', async () => {
    const { service, prisma } = build();

    await service.createAdmin('super-1', DTO);

    const [{ data }] = prisma.user.create.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ];
    expect(data.mustChangePassword).toBe(true);
  });

  it('grants the admin role, or the account can sign in and see nothing', async () => {
    const { service, rbac } = build();

    await service.createAdmin('super-1', DTO);

    expect(rbac.assignRole).toHaveBeenCalledWith('new-admin-1', 'admin', expect.anything());
  });

  /* Account and role in one transaction: half of this pair is worse than neither. */
  it('creates the account and its role in a single transaction', async () => {
    const { service, prisma, rbac } = build();

    await service.createAdmin('super-1', DTO);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [, , tx] = rbac.assignRole.mock.calls[0] as unknown as [string, string, unknown];
    expect(tx).toBe(prisma);
  });

  it('records who created which admin', async () => {
    const { service, audit } = build();

    const result = await service.createAdmin('super-1', DTO);

    expect(audit.record).toHaveBeenCalledWith('super-1', AuditAction.ADMIN_CREATED, {
      userId: 'new-admin-1',
      username: result.credentials.username,
    });
  });

  /* The audit trail must never become a place to read passwords out of. */
  it('keeps the password out of the audit trail', async () => {
    const { service, audit } = build();

    const result = await service.createAdmin('super-1', DTO);

    const [, , meta] = audit.record.mock.calls[0] as unknown as [string, string, unknown];
    expect(JSON.stringify(meta)).not.toContain(result.credentials.password);
  });

  it('retries past a username that is already taken', async () => {
    const { service } = build({ takenUsernames: 2 });

    const result = await service.createAdmin('super-1', DTO);

    expect(result.credentials.username).toMatch(/^jahongirhayitov\./);
  });

  it('refuses a phone number that already belongs to an account', async () => {
    const { service, prisma } = build({ existingPhone: true });

    await expect(
      service.createAdmin('super-1', { ...DTO, phone: '+998901234567' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('issues two different passwords to two admins with the same name', async () => {
    const first = await build().service.createAdmin('super-1', DTO);
    const second = await build().service.createAdmin('super-1', DTO);

    expect(first.credentials.password).not.toBe(second.credentials.password);
    expect(first.credentials.username).not.toBe(second.credentials.username);
  });
});
