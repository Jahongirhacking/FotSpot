import type { MetadataRoute } from 'next';
import { academies as academiesApi, players, trials } from '@/lib/api/resources';
import { absoluteUrl } from '@/lib/seo';

/** Recomputed hourly rather than per request — a crawler is not worth a database sweep each visit. */
export const revalidate = 3600;

/**
 * Every public page, for the crawlers.
 *
 * Players, academies and open trials are generated from the API rather than
 * listed by hand, because the whole point of the sitemap is the pages nobody
 * remembers to add. Private accounts never appear: `players.search` already
 * excludes them, which is the same rule the rest of the product follows rather
 * than a second one written here.
 *
 * Failures degrade to the static routes instead of taking the file down — a
 * sitemap that 500s is worse than one that is short.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/players'), changeFrequency: 'daily', priority: 0.8 },
    { url: absoluteUrl('/academies'), changeFrequency: 'weekly', priority: 0.7 },
    { url: absoluteUrl('/trials'), changeFrequency: 'daily', priority: 0.7 },
    { url: absoluteUrl('/login'), changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/register'), changeFrequency: 'yearly', priority: 0.5 },
    // Linked only from the landing footer, so a crawler would otherwise reach it
    // by that one link or not at all — and it is a page somebody may well look
    // for by name before trusting the platform with a child's details.
    { url: absoluteUrl('/privacy'), changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/terms'), changeFrequency: 'yearly', priority: 0.3 },
    // Higher than the policies: "how do I contact them" is a question people
    // actually search for, where a privacy policy is one they arrive at.
    { url: absoluteUrl('/contact-us'), changeFrequency: 'yearly', priority: 0.4 },
  ];

  const [playerPage, academyList, trialList] = await Promise.all([
    players.search({ pageSize: 200 }, { revalidate }).catch(() => ({ items: [] })),
    academiesApi.listPublic(undefined, { revalidate }).catch(() => []),
    trials.listUpcoming({ revalidate }).catch(() => []),
  ]);

  return [
    ...staticRoutes,
    ...playerPage.items.map((player) => ({
      // The handle, where there is one: it is the address a person would type
      // and the one worth having in an index.
      url: absoluteUrl(player.username ? `/players/@${player.username}` : `/players/${player.id}`),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...academyList.map((academy) => ({
      url: absoluteUrl(`/academies/${academy.id}`),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...trialList.map((trial) => ({
      url: absoluteUrl(`/trials/${trial.id}`),
      changeFrequency: 'daily' as const,
      priority: 0.5,
    })),
  ];
}
