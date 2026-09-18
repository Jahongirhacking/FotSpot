/**
 * Splitting typed or pasted keyword text into chips.
 *
 * Mirrors `seo-keywords.util.ts` on the server, which is the authority on
 * length and count — this only stops the typing before it becomes a rejection.
 */
export const MAX_KEYWORD_LENGTH = 60;
export const MAX_KEYWORDS = 20;

/**
 * The keywords in `text`, split on commas, added to `existing`.
 *
 * "shurtan,, klub,   futbol" becomes shurtan · klub · futbol: each part is
 * trimmed, inner runs of spaces collapse, empty parts from doubled or trailing
 * commas vanish, and a keyword already present — in any capitalisation, in the
 * list or earlier in the same paste — is not added twice. The first spelling
 * stays; the operator chose those capitals. Over-long parts are dropped rather
 * than truncated, because a cut keyword is a different keyword.
 */
export function mergeKeywords(existing: readonly string[], text: string): string[] {
  const kept = [...existing];
  const seen = new Set(existing.map((keyword) => keyword.toLowerCase()));

  for (const part of text.split(',')) {
    const keyword = part.replace(/\s+/g, ' ').trim();
    if (!keyword || keyword.length > MAX_KEYWORD_LENGTH) continue;
    if (seen.has(keyword.toLowerCase())) continue;
    if (kept.length >= MAX_KEYWORDS) break;
    seen.add(keyword.toLowerCase());
    kept.push(keyword);
  }

  return kept;
}
