/**
 * The academy handle rules, mirrored for the browser.
 *
 * ## Why this is a copy, and what keeps it honest
 *
 * The authority is `backend/src/academies/academy-username.util.ts`. There is no
 * shared package between the two (root CLAUDE.md §2), so the client mirrors
 * backend rules by hand — the same arrangement `lib/schemas/` already uses for
 * DTOs. What matters is that the copy is only ever *stricter or equal*: every
 * value this accepts, the server re-checks, and the server is what decides.
 *
 * It exists so the manager reads "handles use underscores" while typing rather
 * than after a round trip, and so the suggestion can be offered without asking
 * the API for one.
 *
 * Uniqueness is deliberately **not** mirrored. Only the database can answer it,
 * and a check here would read as a guarantee it cannot make.
 */

const SUFFIX = 'academy';

export const ACADEMY_HANDLE_MAX = 40;

/** Lowercase letters, digits, single inner underscores — never hyphens. */
const SHAPE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

/** Strips the `@` sigil and lowercases, exactly as the server stores it. */
export function normaliseHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export type HandleProblem = 'shape' | 'suffix' | 'too-long';

/**
 * What is wrong with a handle as it is being typed, or null.
 *
 * An empty value is **not** a problem: clearing the field is how a manager gives
 * a handle up, and flagging it while they delete the old one would put an error
 * under the cursor of somebody doing something legitimate.
 *
 * Shape before suffix, matching the server: a hyphenated value fails both, and
 * "use underscores" is the message that helps.
 */
export function handleProblem(value: string): HandleProblem | null {
  if (!value) return null;
  if (value.length > ACADEMY_HANDLE_MAX) return 'too-long';
  if (!SHAPE.test(value)) return 'shape';
  if (!value.endsWith(SUFFIX)) return 'suffix';
  return null;
}

/**
 * A handle suggested from the academy's name — a suggestion only.
 *
 * Nothing calls this on mount or on a name change. It is offered behind a button
 * the manager presses, and it fills the field rather than saving: a handle
 * becomes part of a public URL, so choosing one is theirs to do.
 *
 * Returns an empty string when the name has nothing the shape can carry — a
 * Cyrillic or Uzbek-script name yields no suggestion rather than a transliterated
 * guess, and the caller then offers no button at all.
 */
export function suggestHandle(name: string): string {
  const stem = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, ACADEMY_HANDLE_MAX - SUFFIX.length - 1)
    .replace(/_+$/, '');

  if (!stem) return '';
  return stem.endsWith(SUFFIX) ? stem : `${stem}_${SUFFIX}`;
}
