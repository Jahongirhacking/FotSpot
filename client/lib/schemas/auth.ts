import { z } from 'zod';

/**
 * Mirrors of the backend auth DTOs (`backend/src/auth/dto/auth.dto.ts`).
 * Zod 4 API: prefer the top-level `z.email()` over the deprecated
 * `z.string().email()` chain.
 */

export const loginEmailSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginEmailValues = z.infer<typeof loginEmailSchema>;

export const registerEmailSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(60),
  lastName: z.string().trim().min(1, 'Enter your last name').max(60),
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
});
export type RegisterEmailValues = z.infer<typeof registerEmailSchema>;

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
