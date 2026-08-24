/**
 * What a keyword list is allowed to be, before it is stored.
 *
 * Pure and DI-free like `scout-level.util.ts`, and shared by academies and
 * trials so the two cannot come to disagree about what a duplicate is.
 *
 * ## Why normalise on the server at all
 *
 * The tag input already trims, refuses blanks and rejects duplicates. That is a
 * courtesy to whoever is typing, not a rule: this endpoint is reachable without
 * the form, and a list that arrived with forty near-identical entries would be
 * exactly the keyword-stuffed metadata §13 exists to prevent. The stuffing is
 * made impossible where the data is written rather than discouraged where it is
 * entered.
 */

/**
 * Long enough for "youth football academy in tashkent", short enough that
 * nobody pastes a paragraph into a meta tag.
 */
export const MAX_KEYWORD_LENGTH = 60;

/**
 * Twenty is already more than any honest page needs.
 *
 * A cap matters less for the database than for the `<head>`: a hundred keywords
 * is not better SEO, it is the signal search engines learned to discount, and
 * it makes the page heavier for every reader on mobile data.
 */
export const MAX_KEYWORDS = 20;

/**
 * Trimmed, de-duplicated, capped — and in the order they were given.
 *
 * Duplicates are compared case- and whitespace-insensitively but the **first
 * spelling is what is kept**: an operator who typed "Tashkent Football Academy"
 * meant those capitals, and lower-casing the stored value to make comparison
 * easy would quietly rewrite their copy. So the comparison is normalised and
 * the value is not.
 *
 * Order is preserved rather than sorted, because the order is the operator's
 * judgement about which terms matter most, and metadata readers weight earlier
 * entries more.
 */
export function normaliseKeywords(input: readonly string[] | null | undefined): string[] {
  if (!input) return [];

  const seen = new Set<string>();
  const kept: string[] = [];

  for (const raw of input) {
    if (typeof raw !== 'string') continue;

    // Inner runs of whitespace collapse too: "youth   football" and
    // "youth football" are the same search term typed carelessly once.
    const value = raw.replace(/\s+/g, ' ').trim();
    if (!value) continue;
    if (value.length > MAX_KEYWORD_LENGTH) continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    kept.push(value);
    if (kept.length >= MAX_KEYWORDS) break;
  }

  return kept;
}
