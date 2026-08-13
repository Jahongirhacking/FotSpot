import * as crypto from 'crypto';

/**
 * Verification for Telegram's Login Widget, which signs rather than tokenises.
 *
 * Telegram hands the browser a plain object — id, name, username, photo, an
 * `auth_date` and a `hash` — and the signature *is* the proof. There is no token
 * to exchange and nothing to call back: every field must be checked here or the
 * whole payload is attacker-controlled, since it arrives through the client.
 *
 * The recipe is Telegram's own (core.telegram.org/widgets/login §Checking
 * authorization):
 *
 *   secret        = SHA256(bot_token)
 *   data_check    = every field except `hash`, as `key=value`, sorted by key,
 *                   joined with newlines
 *   expected      = HMAC_SHA256(data_check, secret)
 *
 * Pure and DI-free (backend/CLAUDE.md §2) so every branch below is testable
 * without a bot, a network or a Nest container — which matters more here than
 * usual, because a mistake in this file is an authentication bypass rather than
 * a wrong answer.
 */

/**
 * How stale a signed payload may be.
 *
 * The signature never expires by itself, so without this a payload captured from
 * a browser's history, a proxy log or a screenshot stays a working credential for
 * ever. A day is long enough that a slow sign-up is not thrown away and short
 * enough that a leaked one is dead by the time it is found.
 */
export const TELEGRAM_AUTH_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * What the widget sends. Everything is a string on the wire, including `id`.
 *
 * The index signature is deliberate: Telegram signs whatever it sent, so a
 * payload may carry fields this interface has never heard of and they still have
 * to reach the hash. Naming only the known ones would drop the rest and break
 * every signature the day Telegram adds a field.
 */
export interface TelegramAuthPayload {
  id: string;
  hash: string;
  auth_date: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  [key: string]: unknown;
}

export type TelegramRejection =
  | 'missing-hash'
  | 'bad-signature'
  | 'stale'
  | 'future-dated'
  | 'malformed-auth-date';

export type TelegramVerification =
  | { ok: true; telegramId: string; firstName?: string; lastName?: string; username?: string }
  | { ok: false; reason: TelegramRejection };

/**
 * `key=value` for every field but `hash`, sorted, newline-joined.
 *
 * Unknown fields are included rather than dropped: Telegram signs whatever it
 * sent, so a payload carrying a field this code has never heard of still has to
 * be hashed with it or the signature will not match. That also means a new
 * Telegram field cannot silently go unverified.
 */
function dataCheckString(payload: Record<string, unknown>): string {
  return Object.keys(payload)
    .filter((key) => key !== 'hash' && payload[key] !== undefined && payload[key] !== null)
    .sort()
    .map((key) => `${key}=${String(payload[key])}`)
    .join('\n');
}

export function verifyTelegramAuth(
  payload: TelegramAuthPayload,
  botToken: string,
  now: Date = new Date(),
): TelegramVerification {
  if (!payload?.hash) return { ok: false, reason: 'missing-hash' };

  const secret = crypto.createHash('sha256').update(botToken).digest();
  const expected = crypto
    .createHmac('sha256', secret)
    .update(dataCheckString(payload))
    .digest('hex');

  const given = Buffer.from(payload.hash, 'hex');
  const mine = Buffer.from(expected, 'hex');
  // Length-checked first: `timingSafeEqual` throws on a mismatch rather than
  // answering false, and a short hash is a rejection, not a crash.
  if (given.length !== mine.length || !crypto.timingSafeEqual(given, mine)) {
    return { ok: false, reason: 'bad-signature' };
  }

  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate)) return { ok: false, reason: 'malformed-auth-date' };

  const ageSeconds = Math.floor(now.getTime() / 1000) - authDate;
  // Signed in the future means a clock is wrong somewhere, and "wrong somewhere"
  // is not something to accept a credential on. A minute of slack absorbs
  // ordinary drift between Telegram's clock and this server's.
  if (ageSeconds < -60) return { ok: false, reason: 'future-dated' };
  if (ageSeconds > TELEGRAM_AUTH_MAX_AGE_SECONDS) return { ok: false, reason: 'stale' };

  return {
    ok: true,
    telegramId: String(payload.id),
    firstName: payload.first_name,
    lastName: payload.last_name,
    username: payload.username,
  };
}
