import type { ConfigService } from '@nestjs/config';

import { TelegramService } from './telegram.service';

/**
 * The Bot API client, and the two things it must never do.
 *
 * 1. **Call out when no bot is configured.** Not a call that fails — none. A
 *    deployment without a bot token is a supported state, the same as
 *    `SmsService` without a gateway.
 * 2. **Let the token escape.** It travels in the URL path because that is the
 *    only place Telegram accepts it, and Telegram echoes URLs back in some error
 *    bodies — so the one realistic leak is a failure description going into a
 *    log. That is asserted here rather than assumed.
 *
 * The third property is the classification: `unreachable` (stop, permanently)
 * versus `failed` (retry). Getting it backwards means either retrying a chat
 * that can never receive, or giving up on a transient 429.
 */

const TOKEN = 'bot-token-12345:AAHsecretvalue';

function build(env: Record<string, string> = { TELEGRAM_BOT_TOKEN: TOKEN }) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const service = new TelegramService(config);
  const fetchMock = jest.fn(async () => new Response('{"ok":true}', { status: 200 }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return { service, fetchMock };
}

const errorBody = (status: number, description: string) =>
  jest.fn(async () => new Response(JSON.stringify({ ok: false, description }), { status }));

describe('unconfigured is a supported state', () => {
  it.each([
    ['nothing at all', {}],
    ['an empty token', { TELEGRAM_BOT_TOKEN: '' }],
    ['whitespace only', { TELEGRAM_BOT_TOKEN: '   ' }],
  ])('reports itself unconfigured with %s', (_why, env) => {
    expect(build(env).service.isConfigured).toBe(false);
  });

  it('is configured once a token is present', () => {
    expect(build().service.isConfigured).toBe(true);
  });

  /* The whole point: not a failed request, no request. */
  it('makes no network call at all without a token', async () => {
    const { service, fetchMock } = build({});

    expect(await service.send('123', 'hello')).toEqual({ status: 'unconfigured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sending', () => {
  it('posts the message to the chat, as HTML', async () => {
    const { service, fetchMock } = build();

    expect(await service.send('123', '<b>hi</b>')).toEqual({ status: 'sent' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/sendMessage');
    expect(JSON.parse(String(init.body))).toEqual(
      expect.objectContaining({ chat_id: '123', text: '<b>hi</b>', parse_mode: 'HTML' }),
    );
  });

  /* A link preview card would be taller than the notification it belongs to. */
  it('suppresses the link preview', async () => {
    const { service, fetchMock } = build();

    await service.send('123', 'hello');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).disable_web_page_preview).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Permanent versus transient — the classification the worker acts on         */
/* -------------------------------------------------------------------------- */

describe('failures that mean "stop trying"', () => {
  it.each([
    ['the user blocked the bot', 403, 'Forbidden: bot was blocked by the user'],
    ['the bot was never started', 403, "Forbidden: bot can't initiate conversation with a user"],
    ['the account is gone', 403, 'Forbidden: user is deactivated'],
    ['the chat does not exist', 400, 'Bad Request: chat not found'],
  ])('reports %s as unreachable', async (_why, status, description) => {
    const { service } = build();
    global.fetch = errorBody(status, description) as unknown as typeof fetch;

    expect((await service.send('123', 'hi')).status).toBe('unreachable');
  });
});

describe('failures that mean "try again"', () => {
  it.each([
    ['rate limiting', 429, 'Too Many Requests: retry after 30'],
    ['a server error', 500, 'Internal Server Error'],
    ['a gateway error', 502, 'Bad Gateway'],
  ])('reports %s as failed, not unreachable', async (_why, status, description) => {
    const { service } = build();
    global.fetch = errorBody(status, description) as unknown as typeof fetch;

    expect((await service.send('123', 'hi')).status).toBe('failed');
  });

  it('reports a network error as failed, and never throws', async () => {
    const { service } = build();
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    expect((await service.send('123', 'hi')).status).toBe('failed');
  });

  it('reports a timeout as failed', async () => {
    const { service } = build();
    global.fetch = jest.fn(async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    }) as unknown as typeof fetch;

    expect((await service.send('123', 'hi')).status).toBe('failed');
  });

  /*
   * A 400 that is not "chat not found" is a bug in what we sent — an unescaped
   * `<`, say. Retryable is the wrong answer in principle but the safe one in
   * practice: it is bounded by the attempt budget and logged either way.
   */
  it('treats an ordinary 400 as failed rather than unreachable', async () => {
    const { service } = build();
    global.fetch = errorBody(400, "Bad Request: can't parse entities") as unknown as typeof fetch;

    expect((await service.send('123', 'hi')).status).toBe('failed');
  });
});

/* -------------------------------------------------------------------------- */
/* The token must not escape                                                  */
/* -------------------------------------------------------------------------- */

describe('the bot token', () => {
  it('is scrubbed out of a failure description Telegram echoed a URL into', async () => {
    const { service } = build();
    global.fetch = errorBody(
      500,
      `Internal error calling https://api.telegram.org/bot${TOKEN}/sendMessage`,
    ) as unknown as typeof fetch;

    const result = await service.send('123', 'hi');

    expect(result.status).toBe('failed');
    expect(JSON.stringify(result)).not.toContain('AAHsecretvalue');
    expect(JSON.stringify(result)).toContain('<redacted>');
  });

  it('never appears in an unreachable reason either', async () => {
    const { service } = build();
    global.fetch = errorBody(403, `Forbidden for bot${TOKEN}`) as unknown as typeof fetch;

    expect(JSON.stringify(await service.send('123', 'hi'))).not.toContain('AAHsecretvalue');
  });

  /* The literal redaction must hold for a real-shaped token too, not only for
     the odd one this file uses. */
  it('is scrubbed for a token in Telegram\'s real format', async () => {
    const real = '123456789:AAHrealLookingSecret';
    const config = { get: () => real } as unknown as ConfigService;
    const service = new TelegramService(config);
    global.fetch = errorBody(
      500,
      `failed calling https://api.telegram.org/bot${real}/sendMessage`,
    ) as unknown as typeof fetch;

    expect(JSON.stringify(await service.send('1', 'hi'))).not.toContain('AAHrealLookingSecret');
  });

  /* It has to be in the URL — Telegram accepts it nowhere else — but it must
     never be in the body, where a request log would capture it. */
  it('is not put in the request body', async () => {
    const { service, fetchMock } = build();

    await service.send('123', 'hi');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init.body)).not.toContain('AAHsecretvalue');
  });
});
