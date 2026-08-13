import { AuthService } from './auth.service';

/**
 * The rule this file exists to hold: an account with a password is never sent an
 * SMS.
 *
 * That is the whole point of the change — SMS costs money per message, and the
 * old flow sent one on every single phone login. A regression here would not
 * break anything visibly; it would just quietly start spending again, which is
 * exactly the kind of fault that survives for months.
 *
 * `phoneAuthStart` is tested directly rather than through HTTP: it is the branch
 * that decides, and the decision is the thing worth pinning.
 */
describe('AuthService.phoneAuthStart — when an SMS is sent', () => {
  function serviceWith(user: { passwordHash?: string | null; isActive?: boolean } | null) {
    const throttle = {
      assertAllowed: jest.fn(async () => undefined),
      recordFailure: jest.fn(async () => undefined),
      clear: jest.fn(async () => undefined),
    };
    const prisma = { user: { findUnique: jest.fn(async () => user) } };

    const service = new AuthService(
      prisma as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
      throttle as never,
      {} as never,
    );
    return { service, throttle, prisma };
  }

  it('asks for the password when the account has one — no OTP', async () => {
    const { service } = serviceWith({ passwordHash: '$argon2id$…', isActive: true });

    await expect(service.phoneAuthStart({ phone: '+998901112233' })).resolves.toEqual({
      next: 'PASSWORD',
    });
  });

  it('falls back to OTP for an account that has never set a password', async () => {
    // The backward-compatibility case: everybody who signed up by phone before
    // this change has `passwordHash: null` and must still be able to get in.
    const { service } = serviceWith({ passwordHash: null, isActive: true });

    await expect(service.phoneAuthStart({ phone: '+998901112233' })).resolves.toEqual({
      next: 'OTP',
    });
  });

  it('answers OTP for a number nobody has registered', async () => {
    // Deliberately the same answer as "registered but no password", so the reply
    // does not tell a stranger sweeping numbers which ones exist. It still
    // reveals which have passwords — unavoidable for a screen that adapts to the
    // number — and that is the whole of what it reveals.
    const { service } = serviceWith(null);

    await expect(service.phoneAuthStart({ phone: '+998900000000' })).resolves.toEqual({
      next: 'OTP',
    });
  });

  it('does not single out a disabled account', async () => {
    // Saying "disabled" here would confirm the account exists. The sign-in it
    // leads to says so, once the caller has proved they hold the credentials.
    const { service } = serviceWith({ passwordHash: '$argon2id$…', isActive: false });

    await expect(service.phoneAuthStart({ phone: '+998901112233' })).resolves.toEqual({
      next: 'OTP',
    });
  });

  it('is rate limited before it looks anything up', async () => {
    // Otherwise it is a free oracle: one request per number, no cost, no limit.
    const { service, throttle, prisma } = serviceWith({ passwordHash: 'x', isActive: true });
    await service.phoneAuthStart({ phone: '+998901112233' }, { ipAddress: '203.0.113.1' });

    expect(throttle.assertAllowed).toHaveBeenCalledWith('login', '203.0.113.1');
    expect(throttle.assertAllowed.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.user.findUnique.mock.invocationCallOrder[0],
    );
  });
});
