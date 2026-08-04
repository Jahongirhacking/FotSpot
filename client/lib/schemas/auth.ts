import { z } from 'zod';

/**
 * Mirrors of the backend auth DTOs (`backend/src/auth/dto/auth.dto.ts`).
 * Zod 4 API: prefer the top-level `z.email()` over the deprecated
 * `z.string().email()` chain.
 */

/**
 * One identifier field accepting an email **or** a username.
 *
 * Academy manager accounts are created by an admin (§1.10) and often have no email
 * at all — a username is the only identifier they can offer. Two separate inputs
 * would make every other user choose between them before typing, so the form asks
 * once and `loginBody` decides which field the API gets.
 */
export const loginEmailSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginEmailValues = z.infer<typeof loginEmailSchema>;

/** An "@" is the only thing that distinguishes the two, and usernames never contain one. */
export function loginBody({ identifier, password }: LoginEmailValues) {
  return identifier.includes('@')
    ? { email: identifier, password }
    : { username: identifier, password };
}

export const registerEmailSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(60),
  lastName: z.string().trim().min(1, 'Enter your last name').max(60),
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
});
export type RegisterEmailValues = z.infer<typeof registerEmailSchema>;

/** Step 2 of signing up: the six digits sent to the address from step 1. */
export const registrationCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'The code is 6 digits'),
});
export type RegistrationCodeValues = z.infer<typeof registrationCodeSchema>;

/** "I can't get in" — the same one-field identifier the sign-in form takes. */
export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username'),
});
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

/**
 * Step 2 of a reset: the code on its own.
 *
 * The code is eight characters from an alphabet that drops `0/O` and `1/I/L`
 * (`backend/src/auth/reset-code.util.ts`), so this only checks the length and the
 * shape — deciding *here* which letters are legal would mean two definitions of
 * the alphabet, and the server's is the one that counts. Spaces, hyphens and case
 * are forgiven for the same reason they are on the server: people paste what they
 * were shown.
 */
export const resetCodeSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username'),
  code: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s-]/g, '').toUpperCase())
    .refine((value) => /^[A-Z0-9]{8}$/.test(value), 'The code is 8 letters and numbers'),
});
export type ResetCodeValues = z.infer<typeof resetCodeSchema>;

/**
 * Step 3: the password the verified code authorises.
 *
 * `confirmPassword` is here and not on sign-up for a reason: a typo when signing
 * up is recoverable by this very flow, whereas a typo here locks the account
 * behind a password nobody knows.
 */
export const newPasswordSchema = z
  .object({
    newPassword: z.string().min(8, 'Use at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Those passwords do not match',
  });
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;

/**
 * The backend uses class-validator's @IsPhoneNumber, which accepts E.164.
 * Uzbek mobile numbers are +998 followed by 9 digits; we accept general E.164 so
 * the form doesn't reject a legitimate foreign number the API would allow.
 */
export const requestOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'Enter your number in full, e.g. +998901234567'),
});
export type RequestOtpValues = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = requestOtpSchema.extend({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'The code is 6 digits'),
});
export type VerifyOtpValues = z.infer<typeof verifyOtpSchema>;
