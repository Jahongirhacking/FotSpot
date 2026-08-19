import type { ConfigService } from '@nestjs/config';
import { SmsService, maskPhone } from './sms.service';
import { isSingleSegment, trialPassSms, SMS_SEGMENT_CHARS } from './sms.messages';

/**
 * The gateway is not wired up yet, and that is the state most of these describe.
 *
 * The property that matters more than any other here: with no credentials this
 * makes **no network call at all**. Not a call that fails, not a call to an empty
 * URL — none. Everything else in `recordVerdict` has already happened by the time
 * this runs, and a trial verdict must not depend on a third party the deployment
 * has not configured yet.
 */

const CONFIGURED = {
  SMS_API_URL: 'https://gateway.example/send',
  SMS_API_TOKEN: 'secret-token-value',
  SMS_SENDER: 'FotSpot',
  APP_PUBLIC_URL: 'https://fotspot.uz',
};

function build(env: Record<string, string> = {}) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const service = new SmsService(config);
  const fetchMock = jest.fn(async () => new Response('', { status: 200 }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return { service, fetchMock };
}

describe('SmsService — unconfigured is a supported state', () => {
  it.each([
    ['nothing at all', {}],
    ['no URL', { ...CONFIGURED, SMS_API_URL: '' }],
    ['no token', { ...CONFIGURED, SMS_API_TOKEN: '' }],
    ['no sender', { ...CONFIGURED, SMS_SENDER: '' }],
    ['whitespace only', { ...CONFIGURED, SMS_API_TOKEN: '   ' }],
  ])('reports itself unconfigured with %s', (_why, env) => {
    expect(build(env).service.isConfigured).toBe(false);
  });

  it('is configured once all three are present', () => {
    expect(build(CONFIGURED).service.isConfigured).toBe(true);
  });

  /* The whole point: not a failed request, no request. */
  it('makes no network call when unconfigured', async () => {
    const { service, fetchMock } = build({});

    const result = await service.send('+998901234567', 'anything');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: false, reason: 'not-configured' });
  });

  it('resolves rather than throwing, so a caller cannot be broken by it', async () => {
    const { service } = build({});

    await expect(service.send('+998901234567', 'anything')).resolves.toBeDefined();
  });
});

describe('SmsService — sending', () => {
  it('posts to the configured gateway with the configured sender', async () => {
    const { service, fetchMock } = build(CONFIGURED);

    const result = await service.send('+998901234567', 'hello');

    expect(result).toEqual({ sent: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(CONFIGURED.SMS_API_URL);
    expect(JSON.parse(init.body as string)).toEqual({
      sender: 'FotSpot',
      to: '+998901234567',
      text: 'hello',
    });
  });

  it('sends the token as a bearer header, never in the body', async () => {
    const { service, fetchMock } = build(CONFIGURED);

    await service.send('+998901234567', 'hello');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toContain(
      CONFIGURED.SMS_API_TOKEN,
    );
    expect(init.body as string).not.toContain(CONFIGURED.SMS_API_TOKEN);
  });

  /*
   * A verdict a coach recorded on a pitch must survive the gateway being down.
   * Both failure shapes — a refusal and an unreachable host — return rather than
   * raise, because the caller fires this without awaiting it.
   */
  it('reports a refusal without throwing', async () => {
    const { service } = build(CONFIGURED);
    global.fetch = jest.fn(async () => new Response('bad sender', { status: 400 })) as never;

    await expect(service.send('+998901234567', 'hello')).resolves.toEqual({
      sent: false,
      reason: 'http-400',
    });
  });

  it('survives an unreachable gateway', async () => {
    const { service } = build(CONFIGURED);
    global.fetch = jest.fn(async () => {
      throw new Error('ETIMEDOUT');
    }) as never;

    await expect(service.send('+998901234567', 'hello')).resolves.toEqual({
      sent: false,
      reason: 'unreachable',
    });
  });
});

describe('SmsService.sendTrialPass', () => {
  it('links to the trial page on the configured public origin', async () => {
    const { service, fetchMock } = build(CONFIGURED);

    await service.sendTrialPass({ phone: '+998901234567', trialId: 't-1', playerId: 'p-1' });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).text).toContain('https://fotspot.uz/trials/t-1');
  });

  /* A player without a phone is ordinary — the field is optional on an account. */
  it('skips a player with no phone number', async () => {
    const { service, fetchMock } = build(CONFIGURED);

    const result = await service.sendTrialPass({ phone: null, trialId: 't-1', playerId: 'p-1' });

    expect(result).toEqual({ sent: false, reason: 'no-phone' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /* A link to localhost is worse than no link: it looks like it works. */
  it('sends nothing when no public origin is configured', async () => {
    const { service, fetchMock } = build({ ...CONFIGURED, APP_PUBLIC_URL: '' });

    const result = await service.sendTrialPass({
      phone: '+998901234567',
      trialId: 't-1',
      playerId: 'p-1',
    });

    expect(result).toEqual({ sent: false, reason: 'no-app-url' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tolerates a trailing slash on the origin', async () => {
    const { service, fetchMock } = build({ ...CONFIGURED, APP_PUBLIC_URL: 'https://fotspot.uz/' });

    await service.sendTrialPass({ phone: '+998901234567', trialId: 't-1', playerId: 'p-1' });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).text).toContain('https://fotspot.uz/trials/t-1');
    expect(JSON.parse(init.body as string).text).not.toContain('//trials');
  });
});

describe('the message itself', () => {
  /*
   * One character outside GSM-7 drops the limit from 160 to 70 and bills the same
   * sentence as three segments. That is invisible until the bill arrives, which
   * is why it is asserted rather than reviewed.
   */
  it('bills as one segment with a realistic link', () => {
    const text = trialPassSms('https://fotspot.uz/trials/8f14e45f-ceea-467a-9f0b-1c2d3e4f5a6b');

    expect(text.length).toBeLessThanOrEqual(SMS_SEGMENT_CHARS);
    expect(isSingleSegment(text)).toBe(true);
  });

  it('says the result and carries the link', () => {
    const text = trialPassSms('https://fotspot.uz/trials/t-1');

    expect(text).toContain('PASS');
    expect(text).toContain('https://fotspot.uz/trials/t-1');
  });

  it('refuses a message carrying a character that would double the cost', () => {
    expect(isSingleSegment('Tabriklaymiz')).toBe(true);
    expect(isSingleSegment('Tabriklaymiz — natija')).toBe(false);
    expect(isSingleSegment('Ozbekiston oʻyinchisi')).toBe(false);
  });

  it('flags a message too long for one segment', () => {
    expect(isSingleSegment('a'.repeat(SMS_SEGMENT_CHARS + 1))).toBe(false);
  });
});

describe('maskPhone — logs identify, they do not disclose', () => {
  it('keeps enough to tell two recipients apart', () => {
    expect(maskPhone('+998901234567')).toBe('+9989…4567');
  });

  it('gives away nothing for a number too short to mask', () => {
    expect(maskPhone('12345')).toBe('***');
  });
});
