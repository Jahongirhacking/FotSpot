import * as crypto from 'crypto';

/**
 * Eight characters, letters and digits — the password-reset code.
 *
 * ## Why longer than the six-digit codes elsewhere
 *
 * A login OTP is throttled to ten guesses and expires in five minutes, so six
 * digits is plenty. A reset code hands over the account outright, so it is worth
 * more to guess and deserves a bigger space: 8 characters over a 31-symbol
 * alphabet is ~10^12 combinations, against a million for six digits.
 *
 * ## Why this alphabet
 *
 * Uppercase only, and without the characters people confuse when copying from an
 * email on a phone: `0`/`O`, `1`/`I`/`L`. A code that looks right and fails is
 * indistinguishable from an expired one to the person typing it, and they retry
 * until the throttle stops them.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 8;

/** Uniform over the alphabet, rejection-sampled so no character is favoured. */
export function generateResetCode(): string {
  // 256 % 31 !== 0, so a plain `byte % 31` would bias the first few letters.
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let out = '';

  while (out.length < LENGTH) {
    for (const byte of crypto.randomBytes(LENGTH * 2)) {
      if (byte >= limit) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === LENGTH) break;
    }
  }

  return out;
}

/**
 * What the user typed, made comparable.
 *
 * People paste codes with spaces, and phone keyboards capitalise inconsistently.
 * Neither is a wrong code, and treating them as one burns a throttle attempt on a
 * correct answer.
 */
export function normaliseResetCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}
