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
 * The metadata every indexable page shares, from one place.
 *
 * ## Why a helper and not the layout
 *
 * The root layout used to declare `alternates.canonical: '/'` and
 * `openGraph.url: '/'` as defaults. Next merges metadata **shallowly** by top-
 * level key, so a page that set only a title inherited the layout's whole
 * `alternates` object — and every such page shipped
 * `<link rel="canonical" href="https://www.fotspot.uz">`. `/players`, `/trials`
 * and `/playing-styles` were all telling Google they were copies of the
 * homepage, and Google agreed: Search Console listed them as "alternate page
 * with proper canonical tag" and left them out of the index.
 *
 * So the layout no longer carries a canonical or an OG url at all, and a page
 * asks for its own here. A page that forgets gets *no* canonical, which is
 * merely a missed opportunity; the old default was an instruction to deindex.
 *
 * `path` is the canonical path — no query, no hash. The one place a query is
 * legitimately part of the page's identity is nowhere on this site: `?page=`,
 * `?showPlayingStyle=`, `?region=` are views of the page, and the canonical
 * says so by omitting them.
 */
export function pageMetadata({
  path,
  title,
  description,
  index = true,
  image = '/fotspot.png',
}: {
  path: string;
  title: string;
  description?: string;
  /** False for a page that exists but must not be in results. */
  index?: boolean;
  image?: string;
}) {
  const url = absoluteUrl(path);
  return {
    title,
    ...(description ? { description } : {}),
    alternates: { canonical: url },
    openGraph: {
      type: 'website' as const,
      url,
      title,
      ...(description ? { description } : {}),
      images: [{ url: image, width: 600, height: 600, alt: 'FotSpot' }],
    },
    twitter: {
      card: 'summary' as const,
      title,
      ...(description ? { description } : {}),
      images: [image],
    },
    robots: { index, follow: true },
  };
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
