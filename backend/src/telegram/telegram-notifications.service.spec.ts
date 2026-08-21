import type { ConfigService } from '@nestjs/config';
import { NotificationEvent } from '@prisma/client';
import type { Queue } from 'bullmq';

import type { PrismaService } from '../prisma/prisma.service';
import { TelegramNotificationsService } from './telegram-notifications.service';
import { escapeHtml, notificationMessage, notificationPath } from './telegram.messages';

/**
 * The bridge, and the promise it makes to the notification flow.
 *
 * §13 is the whole file: **nothing here may fail a notification.** By the time
 * `enqueue` runs the row is written and the socket has fired, so an exception
 * escaping this would turn a *delivered* notification into a failed request for
 * whoever triggered it. Every failure mode is therefore asserted to resolve, not
 * to throw — Redis down, queue refusing, database unreachable, all of them.
 *
 * The second property is eligibility: a message is queued only for somebody who
 * has linked Telegram *and* opened the bot. Either half missing means no job.
 */

type Recipient = { telegramId: string | null; telegramNotificationsEnabled: boolean } | null;

function build(recipient: Recipient, options: { queueThrows?: boolean; dbThrows?: boolean } = {}) {
  const added: { name: string; data: Record<string, unknown> }[] = [];

  const prisma = {
    user: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (options.dbThrows) throw new Error('database is down');
        // Mirror the query's own conditions, so a service that stopped asking
        // for them would start selecting ineligible users here too.
        if (!recipient) return null;
        if (where.telegramNotificationsEnabled === true && !recipient.telegramNotificationsEnabled) {
          return null;
        }
        if (!recipient.telegramId) return null;
        return recipient;
      }),
    },
  } as unknown as PrismaService;

  const queue = {
    add: jest.fn(async (name: string, data: Record<string, unknown>) => {
      if (options.queueThrows) throw new Error('Redis is unreachable');
      added.push({ name, data });
    }),
  } as unknown as Queue;

  const config = { get: () => 'https://fotspot.uz' } as unknown as ConfigService;
  return { service: new TelegramNotificationsService(prisma, config, queue as never), added };
}

const EVENT = NotificationEvent.TRIAL_INVITATION;

describe('who gets a Telegram copy', () => {
  it('queues one for a linked account that has opened the bot', async () => {
    const { service, added } = build({ telegramId: '123', telegramNotificationsEnabled: true });

    await service.enqueue('user-1', EVENT, { trialId: 't1' });

    expect(added).toHaveLength(1);
    expect(added[0].data).toEqual(
      expect.objectContaining({ userId: 'user-1', telegramId: '123', event: EVENT }),
    );
  });

  /* Linked but never started the bot: Telegram would refuse the send, so there
     is nothing to queue. This is the case `telegramNotificationsEnabled` exists
     for. */
  it('queues nothing for a linked account that has not opened the bot', async () => {
    const { service, added } = build({ telegramId: '123', telegramNotificationsEnabled: false });

    await service.enqueue('user-1', EVENT, {});

    expect(added).toEqual([]);
  });

  it('queues nothing for an account with no Telegram at all', async () => {
    const { service, added } = build(null);

    await service.enqueue('user-1', EVENT, {});

    expect(added).toEqual([]);
  });

  /* Read at send time, not carried in by the caller — so a disconnect a moment
     ago cannot be overtaken by a stale value. */
  it('asks the database for both conditions rather than trusting the caller', async () => {
    const { service } = build({ telegramId: '123', telegramNotificationsEnabled: true });

    await service.enqueue('user-1', EVENT, {});

    const where = (service as never as { prisma: { user: { findFirst: jest.Mock } } }).prisma.user
      .findFirst.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        id: 'user-1',
        telegramId: { not: null },
        telegramNotificationsEnabled: true,
      }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* §13 — a Telegram problem must never become a notification problem          */
/* -------------------------------------------------------------------------- */

describe('failures stay inside this service', () => {
  it('resolves when the queue cannot be reached', async () => {
    const { service } = build({ telegramId: '123', telegramNotificationsEnabled: true }, {
      queueThrows: true,
    });

    await expect(service.enqueue('user-1', EVENT, {})).resolves.toBeUndefined();
  });

  it('resolves when the database read fails', async () => {
    const { service } = build(null, { dbThrows: true });

    await expect(service.enqueue('user-1', EVENT, {})).resolves.toBeUndefined();
  });

  /* The retry budget is what makes a 429 survivable; without it one rate-limited
     send is a lost notification. */
  it('queues with a bounded retry budget and backoff', async () => {
    const queueAdd = jest.fn();
    const prisma = {
      user: {
        findFirst: async () => ({ telegramId: '123', telegramNotificationsEnabled: true }),
      },
    } as unknown as PrismaService;
    const config = { get: () => 'https://fotspot.uz' } as unknown as ConfigService;
    const service = new TelegramNotificationsService(
      prisma,
      config,
      { add: queueAdd } as never,
    );

    await service.enqueue('user-1', EVENT, {});

    expect(queueAdd.mock.calls[0][2]).toEqual(
      expect.objectContaining({ attempts: 3, backoff: expect.objectContaining({ delay: 10_000 }) }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Message construction — pure, and the escaping is the part that bites       */
/* -------------------------------------------------------------------------- */

describe('escapeHtml', () => {
  /* Telegram rejects the whole message on a parse error, so an unescaped name
     does not garble the text — it loses the notification entirely. */
  it('escapes the three characters Telegram HTML reserves', () => {
    expect(escapeHtml('Ben & Co <the 10>')).toBe('Ben &amp; Co &lt;the 10&gt;');
  });

  it('escapes the ampersand first, so an escape is not double-escaped', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeHtml("O'Brien — 10/10")).toBe("O'Brien — 10/10");
  });
});

describe('notificationMessage', () => {
  it('escapes the headline it is given', () => {
    const message = notificationMessage({ url: 'https://fotspot.uz/x', headline: '<b>hi</b>' });

    expect(message).toContain('&lt;b&gt;hi&lt;/b&gt;');
  });

  /* An injected `"` would otherwise close the href attribute. */
  it('escapes the url inside the anchor', () => {
    const message = notificationMessage({
      url: 'https://fotspot.uz/x?a=1&b=2',
      headline: 'hi',
    });

    expect(message).toContain('a=1&amp;b=2');
  });

  it('carries the FotSpot mark and the link', () => {
    const message = notificationMessage({ url: 'https://fotspot.uz/trials/1', headline: 'hi' });

    expect(message).toContain('FotSpot');
    expect(message).toContain('https://fotspot.uz/trials/1');
  });
});

describe('notificationPath', () => {
  it('deep-links a trial when the payload carries its id', () => {
    expect(notificationPath(NotificationEvent.TRIAL_INVITATION, { trialId: 't1' })).toBe(
      '/trials/t1',
    );
  });

  /* A guessed id lands on a 404, which is worse than the list. */
  it('falls back to the list when the id is missing', () => {
    expect(notificationPath(NotificationEvent.TRIAL_INVITATION, {})).toBe('/trials');
    expect(notificationPath(NotificationEvent.TRIAL_INVITATION, { trialId: 42 })).toBe('/trials');
  });

  it('sends recommendation events to the recommendations screens', () => {
    expect(notificationPath(NotificationEvent.RECOMMENDATION_ACCEPTED, {})).toBe('/recommendations');
    expect(notificationPath(NotificationEvent.REVIEW_ASSIGNED, {})).toBe('/recommendations/review');
  });

  it('falls back to the notification list for anything else', () => {
    expect(notificationPath(NotificationEvent.ACADEMY_INVITATION, {})).toBe('/notifications');
  });
});
