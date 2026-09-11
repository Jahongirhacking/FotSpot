import { BadRequestException } from '@nestjs/common';

/**
 * The number a player gives out for an academy manager to call.
 *
 * Not the sign-in phone and not verified: nobody is texted a code for it. It
 * is stored the way it will be dialled — E.164, a `+`, the country code and
 * the digits, nothing else — so a manager tapping it on a phone gets a call
 * rather than a formatting puzzle. Spaces, dashes and brackets are what people
 * type between the digits and are dropped; a missing `+` is refused rather
 * than guessed, because "998…" and "0…" mean different things in different
 * countries and a wrong guess is a wrong number on a child's profile.
 *
 * An empty string clears it, the way the social links clear.
 */
const E164 = /^\+[1-9]\d{6,14}$/;

export function normaliseContactPhone(value: string): string | null {
  const compact = value.replace(/[\s().-]/g, '');
  if (compact === '') return null;
  if (!E164.test(compact)) {
    throw new BadRequestException(
      'Contact phone must start with + and the country code, digits only — for example +998901234567',
    );
  }
  return compact;
}
