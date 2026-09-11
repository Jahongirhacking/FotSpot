import * as argon2 from 'argon2';
import { UnauthorizedException } from '@nestjs/common';
import {
  AuthService,
  hashRefreshToken,
  REFRESH_REUSE_GRACE_MS,
  SESSION_INACTIVITY_DAYS,
} from './auth.service';

/**
 * The refresh session: a short access token, a sliding 21-day inactivity
 * window, rotation on every use, and a token *family* so two tabs expiring
 * together are not read as a stolen token.
 *
 * The clock and the token signer are both faked, so "a minute later" and
 * "the token minted by the first rotation" are exact rather than timed.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type SessionRow = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  activeRefreshHashes: string[];
  retiringRefreshHashes: string[];
  retiredAt: Date | null;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
  ipAddress?: string;
  userAgent?: string;
};

function build() {
  let now = Date.parse('2026-09-11T10:00:00.000Z');
  const clock = {
    tick: (ms: number) => {
      now += ms;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
    },
    now: () => now,
  };
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  const RealDate = Date;
  // `new Date()` with no arguments reads the faked clock.
  jest
    .spyOn(global, 'Date')
    .mockImplementation(((...args: unknown[]) =>
      args.length ? new RealDate(...(args as [string])) : new RealDate(now)) as never);
  Object.assign(global.Date, { now: () => now, parse: RealDate.parse, UTC: RealDate.UTC });

  const sessions = new Map<string, SessionRow>();
  let sessionSeq = 0;
  let lock: Promise<void> = Promise.resolve();
  const prisma = {
    session: {
      create: jest.fn(async ({ data }: { data: Partial<SessionRow> }) => {
        const row: SessionRow = {
          id: `session-${++sessionSeq}`,
          userId: data.userId!,
          refreshTokenHash: data.refreshTokenHash ?? '',
          activeRefreshHashes: [],
          retiringRefreshHashes: [],
          retiredAt: null,
          expiresAt: data.expiresAt!,
          lastUsedAt: new RealDate(now),
          revokedAt: null,
        };
        sessions.set(row.id, row);
        return row;
      }),
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) => sessions.get(where.id) ?? null,
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<SessionRow> }) => {
          const row = sessions.get(where.id)!;
          Object.assign(row, data);
          return row;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id?: string; userId?: string; revokedAt?: null };
          data: Partial<SessionRow>;
        }) => {
          let count = 0;
          for (const row of sessions.values()) {
            if (where.id && row.id !== where.id) continue;
            if (where.userId && row.userId !== where.userId) continue;
            if ('revokedAt' in where && row.revokedAt !== null) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      ),
    },
    user: { findUnique: jest.fn(async () => ({ id: 'user-1', isActive: true })) },
    // The row lock: refreshes of one session run one after another, each
    // seeing what the one before it wrote.
    $executeRaw: jest.fn(async () => 1),
    $transaction: jest.fn(async (run: (tx: unknown) => Promise<unknown>) => {
      const previous = lock;
      let release!: () => void;
      lock = new Promise<void>((resolve) => (release = resolve));
      await previous;
      const snapshot = new Map([...sessions].map(([id, row]) => [id, { ...row }]));
      try {
        return await run(prisma);
      } catch (error) {
        // A real transaction rolls back: whatever the callback wrote is gone.
        sessions.clear();
        for (const [id, row] of snapshot) sessions.set(id, row);
        throw error;
      } finally {
        release();
      }
    }),
  };

  // Tokens are opaque strings; `verifyAsync` reads back what `signAsync` recorded.
  const signed = new Map<string, { sub: string; sid: string; exp: number }>();
  let tokenSeq = 0;
  const jwt = {
    signAsync: jest.fn(
      async (
        payload: { sub: string; sid: string; roles?: string[] },
        opts: { expiresIn: string },
      ) => {
        const kind = payload.roles ? 'access' : 'refresh';
        const token = `${kind}-${++tokenSeq}`;
        const days = /^(\d+)d$/.exec(opts.expiresIn);
        signed.set(token, {
          sub: payload.sub,
          sid: payload.sid,
          exp: now + (days ? Number(days[1]) * DAY_MS : 15 * 60_000),
        });
        return token;
      },
    ),
    verifyAsync: jest.fn(async (token: string) => {
      const claims = signed.get(token);
      if (!claims || !token.startsWith('refresh-') || claims.exp <= now) throw new Error('invalid');
      return claims;
    }),
  };

  const service = new AuthService(
    prisma as never,
    jwt as never,
    { get: (key: string) => (key === 'JWT_ACCESS_TTL' ? '15m' : undefined) } as never,
    { getEffectiveAccess: jest.fn(async () => ({ roles: ['player'], permissions: [] })) } as never,
    { clear: jest.fn(async () => undefined) } as never,
    {} as never,
    {} as never,
  );

  /** The private issuer, reached the way login reaches it. */
  const login = () =>
    (
      service as unknown as {
        issueTokens: (
          u: string,
          c?: unknown,
        ) => Promise<{ accessToken: string; refreshToken: string; sessionId: string }>;
      }
    ).issueTokens('user-1', { userAgent: 'UA', ipAddress: '1.1.1.1' });

  return { service, prisma, jwt, sessions, clock, login, signed, RealDate };
}

afterEach(() => jest.restoreAllMocks());

describe('a refresh rotates the token and slides the session', () => {
  it('mints a different refresh token for every rotation, even inside one second', async () => {
    const { service, login, jwt } = build();
    const first = await login();
    await service.refresh({ refreshToken: first.refreshToken });
    await service.refresh({ refreshToken: first.refreshToken });
    const refreshClaims = jwt.signAsync.mock.calls
      .map(([payload]) => payload as { roles?: string[]; jti?: string })
      .filter((payload) => !payload.roles);
    expect(refreshClaims).toHaveLength(3);
    expect(new Set(refreshClaims.map((claims) => claims.jti)).size).toBe(3);
  });

  it('issues a 15-minute access token and a new refresh token, and retires the old one', async () => {
    const { service, login, jwt, sessions } = build();
    const first = await login();

    const second = await service.refresh({ refreshToken: first.refreshToken });

    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ['player'] }),
      expect.objectContaining({ expiresIn: '15m' }),
    );
    const row = sessions.get(first.sessionId)!;
    expect(row.activeRefreshHashes).toEqual([hashRefreshToken(second.refreshToken)]);
    expect(row.retiringRefreshHashes).toEqual([hashRefreshToken(first.refreshToken)]);
    expect(row.refreshTokenHash).toBe(hashRefreshToken(second.refreshToken));
    expect(row.refreshTokenHash).not.toContain(first.refreshToken);
  });

  it('pushes the inactivity expiry out by 21 days from the refresh, not from the login', async () => {
    const { service, login, sessions, clock } = build();
    const first = await login();
    const loginExpiry = sessions.get(first.sessionId)!.expiresAt.getTime();
    expect(loginExpiry - clock.now()).toBe(SESSION_INACTIVITY_DAYS * DAY_MS);

    clock.tick(10 * DAY_MS);
    await service.refresh({ refreshToken: first.refreshToken });

    const slid = sessions.get(first.sessionId)!.expiresAt.getTime();
    expect(slid - clock.now()).toBe(SESSION_INACTIVITY_DAYS * DAY_MS);
    expect(slid).toBeGreaterThan(loginExpiry);
  });

  it('keeps a user signed in indefinitely while they keep refreshing', async () => {
    const { service, login, clock } = build();
    let { refreshToken } = await login();

    for (let day = 0; day < 90; day += 20) {
      clock.tick(20 * DAY_MS);
      ({ refreshToken } = await service.refresh({ refreshToken }));
    }
    expect(refreshToken).toBeDefined();
  });

  it('ends the session after 21 days without a refresh', async () => {
    const { service, login, clock } = build();
    const { refreshToken } = await login();

    clock.tick(SESSION_INACTIVITY_DAYS * DAY_MS + 60_000);

    await expect(service.refresh({ refreshToken })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a token the signer does not recognise, and a revoked session', async () => {
    const { service, login, sessions } = build();
    await expect(service.refresh({ refreshToken: 'refresh-forged' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const { refreshToken, sessionId } = await login();
    sessions.get(sessionId)!.revokedAt = new Date();
    await expect(service.refresh({ refreshToken })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('reuse of a rotated token', () => {
  it('is answered with a fresh pair inside the grace window — two tabs are not a thief', async () => {
    const { service, login, sessions } = build();
    const first = await login();

    // Concurrent, not sequential: both arrive before either has rotated, and
    // the row lock is what makes the second see the first's new token.
    const [tabA, tabB] = await Promise.all([
      service.refresh({ refreshToken: first.refreshToken }),
      service.refresh({ refreshToken: first.refreshToken }),
    ]);

    expect(tabB.refreshToken).not.toBe(tabA.refreshToken);
    const row = sessions.get(first.sessionId)!;
    expect(row.revokedAt).toBeNull();
    expect(row.activeRefreshHashes).toEqual([
      hashRefreshToken(tabA.refreshToken),
      hashRefreshToken(tabB.refreshToken),
    ]);
  });

  it('lets whichever token the cookie jar kept carry on afterwards', async () => {
    const { service, login, clock, sessions } = build();
    const first = await login();
    const tabA = await service.refresh({ refreshToken: first.refreshToken });
    const tabB = await service.refresh({ refreshToken: first.refreshToken });

    clock.tick(15 * 60_000);
    const next = await service.refresh({ refreshToken: tabA.refreshToken });

    const row = sessions.get(first.sessionId)!;
    expect(row.revokedAt).toBeNull();
    // The whole burst retires together; the new token stands alone.
    expect(row.retiringRefreshHashes).toEqual([
      hashRefreshToken(tabA.refreshToken),
      hashRefreshToken(tabB.refreshToken),
    ]);
    expect(row.activeRefreshHashes).toEqual([hashRefreshToken(next.refreshToken)]);
    // And its sibling, presented a moment later by the slower tab, is still fine.
    clock.tick(5_000);
    await expect(service.refresh({ refreshToken: tabB.refreshToken })).resolves.toBeDefined();
    expect(sessions.get(first.sessionId)!.revokedAt).toBeNull();
  });

  it('revokes the session when a retired token is presented after the grace window', async () => {
    const { service, login, clock, sessions } = build();
    const first = await login();
    await service.refresh({ refreshToken: first.refreshToken });

    clock.tick(REFRESH_REUSE_GRACE_MS + 1_000);

    await expect(service.refresh({ refreshToken: first.refreshToken })).rejects.toMatchObject({
      message: 'Refresh token already used',
    });
    expect(sessions.get(first.sessionId)!.revokedAt).not.toBeNull();
  });

  it('revokes the session for a token it never issued to it', async () => {
    const { service, login, sessions, signed } = build();
    const { sessionId } = await login();
    signed.set('refresh-stranger', { sub: 'user-1', sid: sessionId, exp: Date.now() + DAY_MS });

    await expect(service.refresh({ refreshToken: 'refresh-stranger' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sessions.get(sessionId)!.revokedAt).not.toBeNull();
  });

  it('honours a session minted before the family existed, once, and then converts it', async () => {
    const { service, sessions, signed, RealDate } = build();
    const legacyToken = 'refresh-legacy';
    sessions.set('legacy', {
      id: 'legacy',
      userId: 'user-1',
      refreshTokenHash: await argon2.hash(legacyToken),
      activeRefreshHashes: [],
      retiringRefreshHashes: [],
      retiredAt: null,
      expiresAt: new RealDate(Date.now() + DAY_MS),
      lastUsedAt: new RealDate(Date.now()),
      revokedAt: null,
    });
    signed.set(legacyToken, { sub: 'user-1', sid: 'legacy', exp: Date.now() + DAY_MS });

    const rotated = await service.refresh({ refreshToken: legacyToken });

    const row = sessions.get('legacy')!;
    expect(row.refreshTokenHash).toBe(hashRefreshToken(rotated.refreshToken));
    expect(row.retiringRefreshHashes).toEqual([hashRefreshToken(legacyToken)]);
  });
});

describe('logout', () => {
  it('revokes this device’s session so its refresh token is dead at once', async () => {
    const { service, login, sessions } = build();
    const { refreshToken, sessionId } = await login();

    await service.logout('user-1', sessionId);

    expect(sessions.get(sessionId)!.revokedAt).not.toBeNull();
    await expect(service.refresh({ refreshToken })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes every device when asked', async () => {
    const { service, login, sessions } = build();
    const a = await login();
    const b = await login();

    const result = await service.logout('user-1', a.sessionId, true);

    expect(result.sessionsRevoked).toBe(2);
    expect(sessions.get(b.sessionId)!.revokedAt).not.toBeNull();
  });
});
