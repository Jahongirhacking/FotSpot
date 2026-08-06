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
