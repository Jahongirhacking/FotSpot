import * as crypto from 'crypto';

/**
 * Handles in the shape `colour-animal-football-number`, e.g. `amber-falcon-nutmeg-42`.
 *
 * ## Why generated rather than chosen
 *
 * Asking a thirteen-year-old to invent a public handle at signup produces either
 * their real full name or something they regret; asking them at all is a step
 * between them and their card. A generated one is memorable, safe to say out
 * loud, and can be changed later by anyone who cares.
 *
 * The vocabulary is deliberately football and deliberately harmless. Every part
 * is a word a child can read, and nothing in the lists combines into anything
 * unfortunate — which is the reason these are curated lists rather than a
 * dictionary slice.
 *
 * Pure and DI-free (backend/CLAUDE.md §2), so the format and validation rules are
 * testable without a database.
 */

const COLOURS = [
  'amber', 'azure', 'coral', 'crimson', 'emerald', 'golden', 'indigo', 'ivory',
  'jade', 'lilac', 'maroon', 'navy', 'olive', 'pearl', 'ruby', 'sapphire',
  'scarlet', 'silver', 'teal', 'violet',
];

const ANIMALS = [
  'falcon', 'tiger', 'lynx', 'panther', 'eagle', 'wolf', 'cobra', 'stallion',
  'jaguar', 'heron', 'kestrel', 'leopard', 'mustang', 'osprey', 'puma', 'raven',
  'shark', 'viper', 'bison', 'condor',
];

/** One word each, so the handle stays sayable. */
const FOOTBALL = [
  'nutmeg', 'volley', 'rabona', 'panenka', 'screamer', 'golazo', 'hattrick',
  'tikitaka', 'cruyff', 'curler', 'header', 'overlap', 'pressing', 'sweeper',
  'freekick', 'assist', 'playmaker', 'winger', 'libero', 'onetwo',
];

/** Two to three digits — enough to separate collisions, short enough to dictate. */
const MIN_NUMBER = 10;
const MAX_NUMBER = 999;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/**
 * Lowercase letters, digits and single inner hyphens.
 *
 * Deliberately narrow, because a username appears in a URL (`/players/@handle`)
 * and gets read aloud. No underscores, no dots, no uppercase — a handle that
 * differs from another only by case or by a dot is a handle built for
 * impersonation.
 */
const SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Names the router or the product needs for itself.
 *
 * `/players/@me` must never resolve to a person, and an account calling itself
 * `admin` is a phishing tool.
 */
const RESERVED = new Set([
  'me', 'admin', 'administrator', 'root', 'support', 'help', 'api', 'app',
  'fotspot', 'official', 'staff', 'system', 'moderator', 'new', 'edit',
  'settings', 'login', 'logout', 'register', 'search', 'null', 'undefined',
]);

function pick<T>(list: T[]): T {
  return list[crypto.randomInt(list.length)];
}

/** A fresh handle. Callers retry on a unique-constraint collision. */
export function generateUsername(): string {
  const number = crypto.randomInt(MIN_NUMBER, MAX_NUMBER + 1);
  return `${pick(COLOURS)}-${pick(ANIMALS)}-${pick(FOOTBALL)}-${number}`;
}

/** Accepts `@handle` or `handle`, and normalises for storage and lookup. */
export function normaliseUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export interface UsernameProblem {
  reason: 'too-short' | 'too-long' | 'shape' | 'reserved';
}

/**
 * Checks a handle. Returns null when it is fine.
 *
 * Judges the **normalised** form, so `@Joxa` and `joxa` get the same answer —
 * case and a leading `@` are input noise, not a different name. Callers store
 * what `normaliseUsername` produces.
 *
 * Reserved is checked first, before length. `me` is two characters, so a
 * length-first order would reject it as "too short" and never reach the real
 * reason — which is the message the user needs in order to pick something else.
 *
 * Uniqueness is not checked here: that is a database question, and the caller has
 * to survive the race between checking and writing regardless.
 */
export function validateUsername(raw: string): UsernameProblem | null {
  const value = normaliseUsername(raw);

  if (RESERVED.has(value)) return { reason: 'reserved' };
  if (value.length < USERNAME_MIN) return { reason: 'too-short' };
  if (value.length > USERNAME_MAX) return { reason: 'too-long' };
  if (!SHAPE.test(value)) return { reason: 'shape' };

  return null;
}

