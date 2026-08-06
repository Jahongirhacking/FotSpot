import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

/**
 * What a crawler may read.
 *
 * The public half of the product — the landing page, player search, public
 * profiles, academies and open trials — is the half that has to be findable: a
 * parent searching a player's name is how most of this platform's traffic will
 * ever arrive.
 *
 * Everything behind a session is disallowed. Those pages redirect to /login for
 * an anonymous crawler anyway, so indexing them would fill results with sign-in
 * screens, and `/api/` would serve JSON to people expecting a page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/dashboard',
        '/profile',
        '/settings',
        '/notifications',
        '/recommendations',
        '/admin',
        '/onboarding',
        '/welcome',
        '/feed',
        '/groups',
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
