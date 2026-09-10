/**
 * The address a post lives at — `/blog/yangi-akademiya-toshkentda-ochildi`.
 *
 * ## Why it is made here and not by a library
 *
 * A slug is a promise: once shared or indexed it has to keep resolving, so
 * how it is made must not drift with a dependency's next release. The rule
 * is small enough to state: Latin letters and digits, lowercase, words joined
 * by single hyphens, nothing else. Cyrillic — the script much of this
 * platform's news is written in — is transliterated rather than dropped, so a
 * Russian headline still yields readable words; Uzbek Latin apostrophes
 * (oʻ, gʻ, o', g') become the bare letter, which is how people type them in
 * an address bar anyway.
 *
 * Pure and DI-free (backend/CLAUDE.md §2), so the rule is unit-tested on its
 * own and identical wherever it is called.
 */

const CYRILLIC: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  // Uzbek Cyrillic
  ў: 'o',
  қ: 'q',
  ғ: 'g',
  ҳ: 'h',
};

/** The longest an address segment gets — enough for a headline, not a paragraph. */
export const MAX_SLUG_LENGTH = 90;

export function slugify(text: string): string {
  const transliterated = [...text.toLowerCase()]
    .map((char) => CYRILLIC[char] ?? char)
    .join('')
    // Uzbek Latin modifier letters and the apostrophes people type for them.
    .replace(/[ʻʼ'’`´]/g, '')
    // Strip diacritics: "é" → "e", "ş" → "s".
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

  const slug = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return trimToWord(slug, MAX_SLUG_LENGTH);
}

/** Cut at a hyphen rather than mid-word, so the address still reads. */
function trimToWord(slug: string, max: number): string {
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastHyphen = cut.lastIndexOf('-');
  return (lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/g, '');
}

/** Whether an admin-typed slug is one the rule above would have produced. */
export function isValidSlug(slug: string): boolean {
  return (
    slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  );
}

/**
 * The first free slug: the base, then `base-2`, `base-3`, … — never a random
 * suffix, which is what makes two posts with the same headline readable
 * addresses rather than lottery tickets. `taken` answers whether a candidate
 * is already in use; `own` is the row being edited, which may keep its own.
 */
export async function uniqueSlug(
  base: string,
  taken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = base || 'post';
  if (!(await taken(root))) return root;
  for (let n = 2; n < 1000; n++) {
    const candidate = trimToWord(root, MAX_SLUG_LENGTH - String(n).length - 1) + `-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw new Error('Could not find a free slug');
}
