import { ageFrom } from '@/lib/utils';
import { z } from 'zod';

/** Mirrors `backend/src/players/dto/player.dto.ts`. */

export const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'] as const;

export enum PlayingStyles {
  GOAL_POACHER = 'GOAL_POACHER',
  FOX_IN_THE_BOX = 'FOX_IN_THE_BOX',
  DEEP_LYING_FORWARD = 'DEEP_LYING_FORWARD',
  PROLIFIC_WINGER = 'PROLIFIC_WINGER',
  CLASSIC_10 = 'CLASSIC_10',
  BOX_TO_BOX = 'BOX_TO_BOX',
  PLAYMAKER = 'PLAYMAKER',
  ANCHOR_MAN = 'ANCHOR_MAN',
  ORCHESTRATOR = 'ORCHESTRATOR',
  DEFENSIVE_FULLBACK = 'DEFENSIVE_FULLBACK',
  DESTROYER = 'DESTROYER',
  OFFENSIVE_WINGBACK = 'OFFENSIVE_WINGBACK',
  BUILD_UP = 'BUILD_UP',
  OFFENSIVE_KEEPER = 'OFFENSIVE_KEEPER',
  DEFENSIVE_KEEPER = 'DEFENSIVE_KEEPER',
}

export const PLAYING_STYLES = {
  Forward: [
    PlayingStyles.GOAL_POACHER,
    PlayingStyles.FOX_IN_THE_BOX,
    PlayingStyles.DEEP_LYING_FORWARD,
    PlayingStyles.PROLIFIC_WINGER,
    PlayingStyles.CLASSIC_10,
  ],
  Midfield: [
    PlayingStyles.BOX_TO_BOX,
    PlayingStyles.PLAYMAKER,
    PlayingStyles.ANCHOR_MAN,
    PlayingStyles.ORCHESTRATOR,
  ],
  Defence: [
    PlayingStyles.DEFENSIVE_FULLBACK,
    PlayingStyles.OFFENSIVE_WINGBACK,
    PlayingStyles.BUILD_UP,
    PlayingStyles.DESTROYER,
  ],
  Goalkeeper: [PlayingStyles.DEFENSIVE_KEEPER, PlayingStyles.OFFENSIVE_KEEPER],
} as const;

export const ALL_PLAYING_STYLES = Object.values(PLAYING_STYLES).flat();

export const UZBEK_REGIONS = [
  'Tashkent City',
  'Tashkent Region',
  'Andijan',
  'Bukhara',
  'Fergana',
  'Jizzakh',
  'Kashkadarya',
  'Khorezm',
  'Namangan',
  'Navoiy',
  'Samarkand',
  'Sirdaryo',
  'Surkhandarya',
  'Karakalpakstan',
] as const;

/**
 * Step 1 of the player wizard: identity + birth date only.
 *
 * Birth date is asked FIRST and alone because README §11.1 requires the flow to
 * branch on age before collecting anything else about a minor.
 */
export const playerIdentitySchema = z.object({
  firstName: z.string().trim().min(1, 'Enter a first name').max(60),
  lastName: z.string().trim().min(1, 'Enter a last name').max(60),
  birthDate: z
    .string()
    .min(1, 'Enter a date of birth')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid date')
    .refine((value) => new Date(value) <= new Date(), 'That date is in the future')
    .refine((value) => ageFrom(value) <= 60, 'Check the year — that looks too far back'),
  gender: z.enum(['male', 'female'], { message: 'Select one' }),
});
export type PlayerIdentityValues = z.infer<typeof playerIdentitySchema>;

/** Step 2: football detail. All optional — a thin profile still beats no profile. */
export const playerFootballSchema = z.object({
  primaryPosition: z.enum(POSITIONS).optional(),
  secondaryPosition: z.enum(POSITIONS).optional(),
  dominantFoot: z.enum(['LEFT', 'RIGHT', 'BOTH']).optional(),
  playingStyle: z.enum(ALL_PLAYING_STYLES as unknown as [string, ...string[]]).optional(),
  region: z.string().optional(),
  district: z.string().trim().max(80).optional(),
  height: z.coerce.number().min(80).max(230).optional(),
  weight: z.coerce.number().min(20).max(150).optional(),
});
/**
 * Zod 4 note: `z.coerce.number()` has an *input* type of `unknown` (it accepts
 * whatever a text input gives it) and an *output* type of `number`. React Hook Form
 * needs both, so every schema using coercion exports an `…Input` type too and the
 * form is declared as `useForm<Input, unknown, Output>`.
 */
export type PlayerFootballValues = z.output<typeof playerFootballSchema>;
export type PlayerFootballInput = z.input<typeof playerFootballSchema>;

export const playerStatsSchema = z.object({
  matches: z.coerce.number().int().min(0).max(2000).optional(),
  goals: z.coerce.number().int().min(0).max(2000).optional(),
  assists: z.coerce.number().int().min(0).max(2000).optional(),
  cleanSheets: z.coerce.number().int().min(0).max(2000).optional(),
  sprintTime: z.coerce.number().min(2).max(20).optional(),
  jugglingRecord: z.coerce.number().int().min(0).max(10000).optional(),
});
export type PlayerStatsValues = z.infer<typeof playerStatsSchema>;

export const recommendationSchema = z.object({
  academyId: z.string().min(1, 'Choose an academy'),
  note: z.string().trim().max(1000).optional(),
});
export type RecommendationValues = z.infer<typeof recommendationSchema>;

/**
 * Mirrors `CreateAssessmentDto` — the only path that writes attributes.
 *
 * 0–100, the scale every consumer reads (card stars, the §21.2 bars, a clip's
 * coach rating). Accepted only from a coach who shares the player's squad group
 * (TRIAL.md Rule 21); the online review and the trial verdict take no ratings at
 * all (Rule 22).
 */
export const assessmentSchema = z.object({
  speed: z.coerce.number().int().min(0).max(100),
  passing: z.coerce.number().int().min(0).max(100),
  vision: z.coerce.number().int().min(0).max(100),
  dribbling: z.coerce.number().int().min(0).max(100),
  finishing: z.coerce.number().int().min(0).max(100),
  physical: z.coerce.number().int().min(0).max(100),
  leadership: z.coerce.number().int().min(0).max(100),
  discipline: z.coerce.number().int().min(0).max(100),
  notes: z.string().trim().max(2000).optional(),
});
export type AssessmentValues = z.infer<typeof assessmentSchema>;

export const trialSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the trial a title').max(120),
    ageRangeMin: z.coerce.number().int().min(5).max(40),
    ageRangeMax: z.coerce.number().int().min(5).max(40),
    positions: z.array(z.enum(POSITIONS)).min(1, 'Pick at least one position'),
    location: z.string().trim().min(3, 'Where is it?').max(160),
    date: z.string().min(1, 'Pick a date'),
    requirements: z.string().trim().max(1000).optional(),
  })
  .refine((value) => value.ageRangeMax >= value.ageRangeMin, {
    message: 'Maximum age must be at least the minimum',
    path: ['ageRangeMax'],
  });
export type TrialValues = z.infer<typeof trialSchema>;
