import { siteUrl } from '@/lib/seo';
import type { MetadataRoute } from 'next';

/**
 * What a crawler may fetch — which is nearly everything.
 *
 * ## Crawling and indexing are different questions
 *
 * `robots.txt` answers "may you fetch this URL"; `noindex` answers "may this
 * appear in results". They are not interchangeable, and using the first for the
 * second backfires: a URL disallowed here can still be listed in results from
 * its inbound links alone, because a crawler forbidden from fetching it never
 * reads the `noindex` that would have kept it out.
 *
 * So only two prefixes are disallowed, and both because they should not be
 * *fetched* rather than merely hidden:
 *
 * - `/admin` — the operator's screens. Nothing links to them publicly, so there
 *   is no inbound-link path to index them by, and crawling them is pure waste.
 * - `/api` — the Next route handlers. They return JSON to a caller expecting a
 *   page, and some are POST-only endpoints a crawler has no business touching.
 *
 * Prefixes cover their children: `/admin` covers `/admin/users`, `/api` covers
 * `/api/auth`. That is how robots.txt matching works — it is a prefix match, not
 * a path segment match — so listing the children adds nothing.
 *
 * ## Everything else is allowed, including the signed-in half
 *
 * The session-protected pages used to be disallowed here, which was solving the
 * wrong problem. Most of them never reach a crawler anyway: `proxy.ts` redirects
 * an anonymous request for `/dashboard`, `/profile`, `/settings`,
 * `/notifications`, `/recommendations`, `/welcome` and `/onboarding` straight to
 * `/login` before a page renders. The three that *do* render a shell —
 * `/feed`, `/groups/mine` and `/invitations` — carry `noindex` in their own
 * metadata, which is the tool that actually keeps a page out of results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      // One rule for everybody. Naming Googlebot, GPTBot or ClaudeBot separately
      // would mean maintaining a list of crawlers that changes faster than this
      // file does, and every one of them reads the wildcard.
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
