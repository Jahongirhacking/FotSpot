/**
 * Public handles for academies, in the shape `name_academy`.
 *
 * `@bunyodkorfc_academy` resolves `/academies/@bunyodkorfc_academy`, the same way
 * `@amber-falcon-nutmeg-42` resolves a player. Pure and DI-free
 * (backend/CLAUDE.md §2), so the rules are testable without a database.
 *
 * ## Underscores here, hyphens for players — and that is the point
 *
 * `username.util.ts` allows lowercase letters, digits and single inner
 * **hyphens**, and says why: a handle that differs from another only by case or
 * punctuation is a handle built for impersonation. This file allows single inner
 * **underscores** and no hyphens at all.
 *
 * That is not a stylistic difference. Both namespaces sit behind the same `@`
 * sigil, so `/players/@x` and `/academies/@x` are one character apart in a link
 * somebody is asked to trust. Because no player handle can contain `_` and no
 * academy handle can contain `-`, the two sets are **provably disjoint**: an
 * academy cannot take a handle a player already reads as theirs, and no
 * cross-table uniqueness check is needed to guarantee it.
 *
 * It also makes the two visually distinguishable at a glance, which is worth
 * something on a link a parent is deciding whether to click.
 *
 * ## Why the suffix is required
 *
 * Ending in `academy` is what makes the handle self-describing: `@bunyodkorfc`
 * could be a club, a fan account or a player, where `@bunyodkorfc_academy` says
 * what it is before anybody follows it. It also keeps the reserved-word problem
 * small — a handle that must end in `academy` cannot be `admin` or `me`.
 */

/** Every handle ends here, so the shortest possible one is `x_academy`. */
const SUFFIX = 'academy';

export const ACADEMY_USERNAME_MIN = SUFFIX.length + 2; // one character plus `_academy`
export const ACADEMY_USERNAME_MAX = 40;

/**
 * Lowercase letters, digits, single inner underscores.
 *
 * No leading or trailing underscore, and never two in a row: `bunyodkor__fc` and
 * `bunyodkor_fc` read as the same name and would be two accounts.
 */
const SHAPE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

/**
 * Accepts `@handle` or `handle`, and normalises for storage and lookup.
 *
 * Deliberately identical in spirit to `normaliseUsername`: the `@` is a sigil the
 * URL and the UI wear, never part of the stored value, and case is input noise.
 * Storing `@Bunyodkor_Academy` verbatim would mean the unique index treated it as
 * distinct from `bunyodkor_academy`.
 */
export function normaliseAcademyUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export interface AcademyUsernameProblem {
  reason: 'too-short' | 'too-long' | 'shape' | 'suffix' | 'suffix-only';
}

/**
 * Checks a handle. Returns null when it is fine.
 *
 * Judges the **normalised** form, so `@Bunyodkor_Academy` and
 * `bunyodkor_academy` get the same answer.
 *
 * Order matters. Shape is checked before the suffix, because a value containing
 * a hyphen fails both and "use underscores" is the answer that helps —
 * "must end in academy" would send somebody to add a suffix they already had.
 *
 * Uniqueness is **not** checked here: that is a database question, and the caller
 * has to survive the race between checking and writing regardless.
 */
export function validateAcademyUsername(raw: string): AcademyUsernameProblem | null {
  const value = normaliseAcademyUsername(raw);

  if (value.length < ACADEMY_USERNAME_MIN) return { reason: 'too-short' };
  if (value.length > ACADEMY_USERNAME_MAX) return { reason: 'too-long' };
  if (!SHAPE.test(value)) return { reason: 'shape' };
  if (!value.endsWith(SUFFIX)) return { reason: 'suffix' };

  /*
   * `academy` on its own, or anything that is only the suffix repeated with no
   * name in front of it. The handle has to identify *an* academy, and the
   * length floor alone does not catch `academyacademy`.
   */
  const stem = value.slice(0, -SUFFIX.length).replace(/_+$/, '');
  if (!stem || stem === SUFFIX) return { reason: 'suffix-only' };

  return null;
}

/**
 * A handle suggested from the academy's own name, for the form to offer.
 *
 * A suggestion only — the manager may replace it, and the database still decides
 * whether it is free. Anything the shape cannot carry is dropped rather than
 * transliterated: guessing that `Ў` means `o` is a guess, and a handle is not
 * the place to make one.
 */
export function suggestAcademyUsername(name: string): string {
  const stem = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    // Leave room for the suffix within the maximum.
    .slice(0, ACADEMY_USERNAME_MAX - SUFFIX.length - 1)
    .replace(/_+$/, '');

  if (!stem) return '';

  // Already ends in `academy` — "fc_academy_academy" helps nobody.
  return stem.endsWith(SUFFIX) ? stem : `${stem}_${SUFFIX}`;
}
