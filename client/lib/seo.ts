/**
 * The site's own address, for canonicals, sitemaps and social cards.
 *
 * Absolute URLs are not optional in any of those three: a relative canonical is
 * ignored, and a relative OpenGraph image is not fetched. `NEXT_PUBLIC_SITE_URL`
 * is the deployment's public origin; the localhost fallback keeps development
 * working without making a developer's machine the canonical host by accident.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

/** Absolute URL for a path, for metadata that cannot take a relative one. */
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * JSON-LD, rendered as a script tag.
 *
 * Structured data is what turns a result into a rich one — a player card in
 * search rather than a blue link — and it is the only part of a page a crawler
 * reads as data rather than prose.
 */
export function jsonLd(data: Record<string, unknown>) {
  return {
    __html: JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c'),
  };
}

/**
 * The keyword list a page hands to `metadata.keywords`.
 *
 * ## What this is and is not worth
 *
 * `<meta name="keywords">` has not been a Google ranking signal for many years,
 * and nothing here changes that. It is emitted because Yandex — which is the
 * search engine that matters for a platform whose academies are all in
 * Uzbekistan — still reads it, and because a stored keyword list is worth
 * something even where the tag is ignored: it is operator intent, in one place,
 * available to whatever the site does next.
 *
 * The keywords therefore *supplement* the page's real metadata. The title,
 * description, canonical and OpenGraph tags on both the academy and trial pages
 * are built from actual content and are unchanged by this — the ranking value,
 * such as it is, lives there.
 *
 * ## Why they are not appended to titles or descriptions
 *
 * That is keyword stuffing, and it is the thing search engines demote. A title
 * reading "U16 Trial | tashkent football trial, youth football uzbekistan"
 * is worse for a human reading a result and worse for the crawler. The stored
 * terms go where terms belong.
 *
 * Returns `undefined` rather than an empty array for an empty list: Next omits
 * the tag entirely for `undefined`, where `[]` renders `content=""` — an empty
 * meta tag is noise that says nothing.
 */
export function seoKeywords(
  stored: readonly string[] | null | undefined,
  /** Terms from the page's real content — name, place. Deduplicated against
      the stored list so the tag never repeats itself. */
  fromContent: readonly (string | null | undefined)[] = [],
): string[] | undefined {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const value of [...(stored ?? []), ...fromContent]) {
    const keyword = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    if (!keyword) continue;

    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    kept.push(keyword);
  }

  return kept.length > 0 ? kept : undefined;
}
