import * as crypto from 'node:crypto';
import { AuthService } from './auth.service';

/**
 * A Google token or a Telegram signature proves who somebody is; it does not
 * give the account a password. Without one there is no username-and-password
 * way back in, so the account is held on the password screen after signing
 * in — the same `mustChangePassword` lock an admin-minted account and an OTP
 * sign-in already use. An account that has a password is left alone.
 */

const BOT_TOKEN = '123456:test-bot-token';

/** A Telegram Login Widget payload, signed the way the widget signs it. */
function signedTelegram(fields: Record<string, string>) {
  const payload: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    ...fields,
  };
  const check = Object.keys(payload)
    .sort()
    .map((key) => `${key}=${payload[key]}`)
    .join('\n');
  const secret = crypto.createHash('sha256').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
  return { ...payload, hash };
}

function build(existing: Record<string, unknown> | null) {
  const prisma = {
    user: {
      findUnique: jest.fn(async (): Promise<unknown> => existing),
      update: jest.fn(async (_args: { where: unknown; data: Record<string, unknown> }) => ({})),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'user-new',
        ...data,
      })),
      // `mintUsername` checks the handle is free.
      findFirst: jest.fn(async (): Promise<unknown> => null),
      count: jest.fn(async () => 0),
    },
    session: {
      create: jest.fn(async () => ({ id: 'session-1' })),
      update: jest.fn(async () => ({})),
    },
  };
  const service = new AuthService(
    prisma as never,
    { signAsync: jest.fn(async () => 'token') } as never,
    { get: (key: string) => (key === 'TELEGRAM_BOT_TOKEN' ? BOT_TOKEN : undefined) } as never,
    { getEffectiveAccess: jest.fn(async () => ({ roles: [], permissions: [] })) } as never,
    { clear: jest.fn(async () => undefined) } as never,
    {
      verify: jest.fn(async () => ({ email: 'a@example.test', firstName: 'A', lastName: 'B' })),
    } as never,
    {} as never,
  );
  return { service, prisma };
}

const lockWrites = (prisma: ReturnType<typeof build>['prisma']) =>
  prisma.user.update.mock.calls.filter(([args]) => args.data.mustChangePassword === true);

describe('Google sign-in and the password', () => {
  it('holds an existing account with no password on the password screen', async () => {
    const { service, prisma } = build({
      id: 'user-1',
      isActive: true,
      emailVerifiedAt: new Date(),
      passwordHash: null,
      mustChangePassword: false,
    });

    await service.googleLogin('id-token');

    expect(lockWrites(prisma)).toHaveLength(1);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: { mustChangePassword: true } }),
    );
  });

  it('leaves an account that already has a password alone', async () => {
    const { service, prisma } = build({
      id: 'user-1',
      isActive: true,
      emailVerifiedAt: new Date(),
      passwordHash: '$argon2id$…',
      mustChangePassword: false,
    });

    await service.googleLogin('id-token');

    expect(lockWrites(prisma)).toHaveLength(0);
  });

  it('does not write the lock twice', async () => {
    const { service, prisma } = build({
      id: 'user-1',
      isActive: true,
      emailVerifiedAt: new Date(),
      passwordHash: null,
      mustChangePassword: true,
    });

    await service.googleLogin('id-token');

    expect(lockWrites(prisma)).toHaveLength(0);
  });

  it('creates a first-time account already locked', async () => {
    const { service, prisma } = build(null);

    await service.googleLogin('id-token');

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'a@example.test', mustChangePassword: true }),
      }),
    );
  });
});

describe('Telegram sign-in and the password', () => {
  const payload = signedTelegram({ id: '424242', first_name: 'Bobur' });

  it('holds an existing account with no password on the password screen', async () => {
    const { service, prisma } = build({
      id: 'user-1',
      isActive: true,
      passwordHash: null,
      mustChangePassword: false,
    });

    await service.telegramLogin(payload as never);

    expect(lockWrites(prisma)).toHaveLength(1);
  });

  it('leaves an account that already has a password alone', async () => {
    const { service, prisma } = build({
      id: 'user-1',
      isActive: true,
      passwordHash: '$argon2id$…',
      mustChangePassword: false,
    });

    await service.telegramLogin(payload as never);

    expect(lockWrites(prisma)).toHaveLength(0);
  });

  it('creates a first-time account already locked', async () => {
    const { service, prisma } = build(null);

    await service.telegramLogin(payload as never);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ telegramId: '424242', mustChangePassword: true }),
      }),
    );
  });
});
