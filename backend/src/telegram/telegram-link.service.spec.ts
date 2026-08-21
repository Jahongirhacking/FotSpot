import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

import type { PrismaService } from '../prisma/prisma.service';
import { TelegramLinkService } from './telegram-link.service';
import type { ConnectTelegramDto } from './dto/telegram.dto';

/**
 * Linking a Telegram account to one that is already signed in.
 *
 * Two properties carry the whole feature, and both are about *not* writing:
 *
 * 1. A Telegram id already owned by somebody else is a 409 and **nothing is
 *    written to either account**. Overwriting it would hand one person's account
 *    to another on the strength of a Telegram login, with the loser absent.
 * 2. `telegramId` is never cleared and never replaced. It is the identity
 *    `telegramLogin` recognises a returning user by, so detaching one turns the
 *    next Telegram sign-in into a brand-new account — an unlimited supply of
 *    them, one per disconnect.
 *
 * Both are asserted on the *state of the mock*, not only on the thrown error —
 * an exception that is thrown after the write has happened would pass a test
 * that only checked the exception.
 */

const BOT_TOKEN = 'test-bot-token';

/** Signs a payload the way Telegram does, so the tests exercise the real check. */
function signed(id: string, botToken = BOT_TOKEN): ConnectTelegramDto {
  const fields: Record<string, string> = {
    id,
    auth_date: String(Math.floor(Date.now() / 1000)),
    first_name: 'Aziz',
  };
  const secret = crypto.createHash('sha256').update(botToken).digest();
  const check = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
  return { ...fields, hash } as unknown as ConnectTelegramDto;
}

interface Row {
  id: string;
  telegramId: string | null;
  telegramNotificationsEnabled: boolean;
  phone: string | null;
  email: string | null;
}

function build(rows: Row[], env: Record<string, string> = { TELEGRAM_BOT_TOKEN: BOT_TOKEN }) {
  const store = new Map(rows.map((row) => [row.id, { ...row }]));
  const updates: { id: string; data: Record<string, unknown> }[] = [];

  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; telegramId?: string } }) => {
        if (where.id) return store.get(where.id) ?? null;
        return [...store.values()].find((row) => row.telegramId === where.telegramId) ?? null;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const taken = [...store.values()].find(
          (row) => data.telegramId && row.telegramId === data.telegramId && row.id !== where.id,
        );
        // The unique index, modelled: the database is the last word, not the
        // read that preceded this.
        if (taken) {
          throw new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002',
            clientVersion: '5',
          });
        }
        updates.push({ id: where.id, data });
        const row = { ...store.get(where.id)!, ...data } as Row;
        store.set(where.id, row);
        return row;
      }),
      /*
       * Every condition in the `where` is honoured, including `id`.
       *
       * `attachIfFree` relies on `{ id, telegramId: null }` matching nothing once
       * the row has an id — that conditional write is what makes the check
       * atomic. A fake that matched on `telegramId` alone would be looser than
       * the database and would pass a version of the code that overwrites.
       */
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id?: string; telegramId?: string | null };
          data: Record<string, unknown>;
        }) => {
          let count = 0;
          for (const [id, row] of store) {
            if (where.id !== undefined && row.id !== where.id) continue;
            if (where.telegramId !== undefined && row.telegramId !== where.telegramId) continue;
            store.set(id, { ...row, ...data } as Row);
            updates.push({ id, data });
            count += 1;
          }
          return { count };
        },
      ),
    },
  } as unknown as PrismaService;

  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return { service: new TelegramLinkService(prisma, config), store, updates };
}

const user = (over: Partial<Row> & { id: string }): Row => ({
  telegramId: null,
  telegramNotificationsEnabled: false,
  phone: null,
  email: null,
  ...over,
});

/* -------------------------------------------------------------------------- */
/* §5 — the conflict, which is the point of the whole feature                 */
/* -------------------------------------------------------------------------- */

describe('connect — a Telegram account somebody else already holds', () => {
  const scenario = () =>
    build([
      user({ id: 'A', telegramId: '123456', telegramNotificationsEnabled: true }),
      user({ id: 'B', phone: '+998900000000' }),
    ]);

  it('refuses with a conflict rather than moving the account', async () => {
    const { service } = scenario();

    await expect(service.connect('B', signed('123456'))).rejects.toBeInstanceOf(ConflictException);
  });

  /* The assertion that matters more than the status code. */
  it('leaves User A completely untouched', async () => {
    const { service, store, updates } = scenario();

    await service.connect('B', signed('123456')).catch(() => undefined);

    expect(store.get('A')).toEqual(
      expect.objectContaining({ telegramId: '123456', telegramNotificationsEnabled: true }),
    );
    expect(updates).toEqual([]);
  });

  it('leaves User B without a Telegram link', async () => {
    const { service, store } = scenario();

    await service.connect('B', signed('123456')).catch(() => undefined);

    expect(store.get('B')?.telegramId).toBeNull();
  });

  it('tells the person how to reach the other account', async () => {
    const { service } = scenario();

    await expect(service.connect('B', signed('123456'))).rejects.toThrow(
      /already connected to another FotSpot account/i,
    );
  });

  /*
   * The check above is an optimisation of the error message; the unique index is
   * what actually enforces this. Two callers can pass the lookup at the same
   * moment, and the loser must get the same 409 rather than a 500.
   */
  it('turns a lost race on the unique index into the same conflict', async () => {
    const { service, store } = build([
      user({ id: 'A' }),
      user({ id: 'B', phone: '+998900000000' }),
    ]);
    // A took the id after B's lookup but before B's write.
    store.set('A', { ...store.get('A')!, telegramId: '123456' });

    await expect(service.connect('B', signed('123456'))).rejects.toBeInstanceOf(ConflictException);
  });
});

/* -------------------------------------------------------------------------- */
/* §4 / §17 — the id comes from the signature, never from the request         */
/* -------------------------------------------------------------------------- */

describe('connect — the Telegram id is taken from the verified payload', () => {
  it('links the id the signature covers, and turns notifications on', async () => {
    const { service, store } = build([user({ id: 'B', phone: '+998900000000' })]);

    await service.connect('B', signed('987654'));

    expect(store.get('B')).toEqual(
      expect.objectContaining({ telegramId: '987654', telegramNotificationsEnabled: true }),
    );
  });

  it('refuses a payload signed with the wrong bot token', async () => {
    const { service, store } = build([user({ id: 'B', phone: '+998900000000' })]);

    await expect(service.connect('B', signed('987654', 'another-bot'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(store.get('B')?.telegramId).toBeNull();
  });

  it('refuses a payload whose id was edited after signing', async () => {
    const { service, store } = build([user({ id: 'B', phone: '+998900000000' })]);
    const forged = { ...signed('987654'), id: '111111' };

    await expect(service.connect('B', forged)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(store.get('B')?.telegramId).toBeNull();
  });

  /* Without a bot token there is nothing to verify against, and "no signature to
     check" must never resolve to "accept it". */
  it('refuses to link at all when no bot token is configured', async () => {
    const { service, store } = build([user({ id: 'B', phone: '+998900000000' })], {});

    await expect(service.connect('B', signed('987654'))).rejects.toThrow(/not configured/i);
    expect(store.get('B')?.telegramId).toBeNull();
  });

  /* A double press, or a retry after a dropped response. */
  /* Pressing Connect while already connected is a request to be reachable, not
     a mistake to report. */
  it('is idempotent for the same id, and re-enables notifications', async () => {
    const { service, store } = build([
      user({ id: 'B', telegramId: '987654', telegramNotificationsEnabled: false, phone: '+9989' }),
    ]);

    await expect(service.connect('B', signed('987654'))).resolves.toEqual(
      expect.objectContaining({ connected: true, notificationsEnabled: true }),
    );
    expect(store.get('B')?.telegramId).toBe('987654');
  });
});

/* -------------------------------------------------------------------------- */
/* Disconnecting turns messages off — it never detaches the identity          */
/* -------------------------------------------------------------------------- */

describe('setNotifications', () => {
  /**
   * The assertion this whole redesign exists for.
   *
   * `telegramLogin` finds a returning user by `findUnique({ telegramId })`. An id
   * that stops being stored stops being found, and the next Telegram sign-in
   * mints a brand-new account — so a disconnect that cleared the column would be
   * an unlimited free-account generator, one per press.
   */
  it('keeps the Telegram id when notifications are turned off', async () => {
    const { service, store } = build([
      user({ id: 'B', telegramId: '123', telegramNotificationsEnabled: true, phone: '+998900000000' }),
    ]);

    await service.setNotifications('B', false);

    expect(store.get('B')?.telegramId).toBe('123');
    expect(store.get('B')?.telegramNotificationsEnabled).toBe(false);
  });

  it('writes only the preference column', async () => {
    const { service, updates } = build([
      user({ id: 'B', telegramId: '123', telegramNotificationsEnabled: true, phone: '+998900000000' }),
    ]);

    await service.setNotifications('B', false);

    expect(Object.keys(updates[0].data)).toEqual(['telegramNotificationsEnabled']);
  });

  it('turns them back on again', async () => {
    const { service, store } = build([user({ id: 'B', telegramId: '123' })]);

    await service.setNotifications('B', true);

    expect(store.get('B')).toEqual(
      expect.objectContaining({ telegramId: '123', telegramNotificationsEnabled: true }),
    );
  });

  /*
   * A Telegram-only account may switch messages off. The old lockout guard
   * refused this, which was right when disconnecting removed the identity and is
   * wrong now that it does not — the account can still sign in afterwards, so
   * the guard would only be forbidding a harmless preference.
   */
  it('lets a Telegram-only account turn notifications off', async () => {
    const { service, store } = build([
      user({ id: 'C', telegramId: '123', telegramNotificationsEnabled: true }),
    ]);

    await service.setNotifications('C', false);

    expect(store.get('C')).toEqual(
      expect.objectContaining({ telegramId: '123', telegramNotificationsEnabled: false }),
    );
  });

  it('refuses to enable notifications for an account with no Telegram', async () => {
    const { service } = build([user({ id: 'B', phone: '+998900000000' })]);

    await expect(service.setNotifications('B', true)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is a no-op when disabling for an account with no Telegram', async () => {
    const { service, updates } = build([user({ id: 'B', phone: '+998900000000' })]);

    await expect(service.setNotifications('B', false)).resolves.toEqual(
      expect.objectContaining({ connected: false }),
    );
    expect(updates).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The account-farming scenario, end to end                                   */
/* -------------------------------------------------------------------------- */

describe('a Telegram identity survives everything a user can do to it', () => {
  /**
   * Disconnect → sign in again → the SAME account, every time.
   *
   * `telegramLogin` is not called here (it lives in AuthService), so this asserts
   * the property it depends on: after any number of disconnects, a lookup by the
   * Telegram id still finds the original account. If that ever returns null,
   * `telegramLogin` creates a second user and the farm is open.
   */
  it('still resolves to the original account after repeated disconnects', async () => {
    const { service, store } = build([
      user({ id: 'user-1', telegramId: '123456', telegramNotificationsEnabled: true }),
    ]);

    const findsOriginal = () =>
      [...store.values()].find((row) => row.telegramId === '123456')?.id ?? null;

    for (let round = 0; round < 5; round += 1) {
      await service.setNotifications('user-1', false);
      expect(findsOriginal()).toBe('user-1');

      await service.setNotifications('user-1', true);
      expect(findsOriginal()).toBe('user-1');
    }

    expect(store.size).toBe(1);
  });

  /*
   * The second door, and the one that needed no disconnect at all: connecting a
   * *different* Telegram account while already holding one used to overwrite the
   * column, orphaning the old id just as effectively.
   */
  it('refuses to swap one Telegram account for another', async () => {
    const { service, store } = build([
      user({ id: 'B', telegramId: '111111', phone: '+998900000000' }),
    ]);

    await expect(service.connect('B', signed('222222'))).rejects.toBeInstanceOf(ConflictException);
    expect(store.get('B')?.telegramId).toBe('111111');
  });

  it('says the swap is unsupported rather than reporting the other-account conflict', async () => {
    const { service } = build([user({ id: 'B', telegramId: '111111' })]);

    await expect(service.connect('B', signed('222222'))).rejects.toThrow(
      /already connected to a different Telegram account/i,
    );
  });

  /* Belt and braces: no method on this service may ever write a null id. */
  it('never writes a null telegramId, whatever is called', async () => {
    const { service, updates } = build([
      user({ id: 'B', telegramId: '123', telegramNotificationsEnabled: true, phone: '+9989' }),
    ]);

    await service.setNotifications('B', false);
    await service.setNotifications('B', true);
    await service.connect('B', signed('123'));
    await service.enableFromStart('123');

    for (const update of updates) {
      expect(update.data.telegramId ?? 'absent').not.toBeNull();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* §3 / §16 — what the status endpoint discloses                              */
/* -------------------------------------------------------------------------- */

describe('status', () => {
  it('reports connected and reachable separately', async () => {
    const { service } = build([
      user({ id: 'B', telegramId: '123', telegramNotificationsEnabled: false }),
    ]);

    expect(await service.status('B')).toEqual(
      expect.objectContaining({ connected: true, notificationsEnabled: false }),
    );
  });

  /*
   * A linked account is not a reachable one until /start. If these collapsed
   * into one boolean the UI could not tell somebody what is still missing.
   */
  it('becomes reachable only after /start', async () => {
    const { service } = build([user({ id: 'B', telegramId: '123' })]);

    await service.enableFromStart('123');

    expect(await service.status('B')).toEqual(
      expect.objectContaining({ connected: true, notificationsEnabled: true }),
    );
  });

  it('discloses no Telegram identity of any kind', async () => {
    const { service } = build([user({ id: 'B', telegramId: '123456789' })]);

    const status = await service.status('B');

    expect(JSON.stringify(status)).not.toContain('123456789');
    expect(status).not.toHaveProperty('telegramId');
  });

  it('never carries the bot token', async () => {
    const { service } = build([user({ id: 'B', telegramId: '123' })]);

    expect(JSON.stringify(await service.status('B'))).not.toContain(BOT_TOKEN);
  });
});

describe('the bot side of the link', () => {
  /* A /start from somebody who has not linked must not enable anything. */
  it('enables nothing for an unlinked Telegram account', async () => {
    const { service, store } = build([user({ id: 'B', telegramId: '123' })]);

    expect(await service.enableFromStart('999')).toEqual({ linked: false });
    expect(store.get('B')?.telegramNotificationsEnabled).toBe(false);
  });

});
