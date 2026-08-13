import * as crypto from 'crypto';
import {
  TELEGRAM_AUTH_MAX_AGE_SECONDS,
  TelegramAuthPayload,
  verifyTelegramAuth,
} from './telegram-oauth.util';

const BOT_TOKEN = '7654321:AAH-fake-token-for-tests';
const NOW = new Date('2026-08-12T12:00:00.000Z');

/** Signs a payload the way Telegram does, so the tests exercise the real recipe. */
function sign(fields: Record<string, string>, botToken = BOT_TOKEN): TelegramAuthPayload {
  const secret = crypto.createHash('sha256').update(botToken).digest();
  const check = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
  return { ...fields, hash } as unknown as TelegramAuthPayload;
}

const freshFields = () => ({
  id: '123456789',
  first_name: 'Javohir',
  last_name: 'Rustamov',
  username: 'javohir',
  auth_date: String(Math.floor(NOW.getTime() / 1000) - 30),
});

describe('verifyTelegramAuth', () => {
  it('accepts a payload Telegram signed, and reports who it is', () => {
    const result = verifyTelegramAuth(sign(freshFields()), BOT_TOKEN, NOW);

    expect(result).toEqual({
      ok: true,
      telegramId: '123456789',
      firstName: 'Javohir',
      lastName: 'Rustamov',
      username: 'javohir',
    });
  });

  it('rejects a payload signed with a different bot token', () => {
    // The whole point: without the right token nobody can mint one of these, so
    // the signature is what stands between the widget and "log in as anyone".
    const forged = sign(freshFields(), '1111111:some-other-bot');

    expect(verifyTelegramAuth(forged, BOT_TOKEN, NOW)).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('rejects a field edited after signing', () => {
    const payload = sign(freshFields());
    const tampered = { ...payload, id: '999999999' };

    expect(verifyTelegramAuth(tampered, BOT_TOKEN, NOW)).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('rejects an added field, because Telegram signed what it sent', () => {
    // An attacker appending a field they hope is ignored changes the check
    // string, so the signature stops matching. This is why unknown keys are
    // hashed rather than filtered out.
    const payload = { ...sign(freshFields()), phone_number: '+998901234567' };

    expect(verifyTelegramAuth(payload, BOT_TOKEN, NOW)).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('rejects a payload with no hash at all', () => {
    const { hash: _hash, ...unsigned } = sign(freshFields());

    expect(verifyTelegramAuth(unsigned as TelegramAuthPayload, BOT_TOKEN, NOW)).toEqual({
      ok: false,
      reason: 'missing-hash',
    });
  });

  it('rejects a short or non-hex hash without throwing', () => {
    // `timingSafeEqual` throws on differing lengths, so this is the difference
    // between a rejection and a 500 that anybody can trigger at will.
    for (const hash of ['ab', '', 'zz'.repeat(32)]) {
      const result = verifyTelegramAuth({ ...sign(freshFields()), hash }, BOT_TOKEN, NOW);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects a signature older than a day', () => {
    // Valid for ever otherwise: the signature carries no expiry, so a payload
    // recovered from a proxy log or a screenshot would stay a working credential.
    const stale = sign({
      ...freshFields(),
      auth_date: String(Math.floor(NOW.getTime() / 1000) - TELEGRAM_AUTH_MAX_AGE_SECONDS - 1),
    });

    expect(verifyTelegramAuth(stale, BOT_TOKEN, NOW)).toEqual({ ok: false, reason: 'stale' });
  });

  it('accepts one signed a moment inside the window', () => {
    const justInside = sign({
      ...freshFields(),
      auth_date: String(Math.floor(NOW.getTime() / 1000) - TELEGRAM_AUTH_MAX_AGE_SECONDS + 5),
    });

    expect(verifyTelegramAuth(justInside, BOT_TOKEN, NOW).ok).toBe(true);
  });

  it('tolerates ordinary clock drift but not a future-dated payload', () => {
    const seconds = Math.floor(NOW.getTime() / 1000);

    expect(verifyTelegramAuth(sign({ ...freshFields(), auth_date: String(seconds + 30) }), BOT_TOKEN, NOW).ok).toBe(
      true,
    );
    expect(
      verifyTelegramAuth(sign({ ...freshFields(), auth_date: String(seconds + 600) }), BOT_TOKEN, NOW),
    ).toEqual({ ok: false, reason: 'future-dated' });
  });

  it('rejects an auth_date that is not a number', () => {
    expect(verifyTelegramAuth(sign({ ...freshFields(), auth_date: 'yesterday' }), BOT_TOKEN, NOW)).toEqual(
      { ok: false, reason: 'malformed-auth-date' },
    );
  });
});
