import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { media } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { FeedPage as FeedPageData, SuggestedPlayer } from '@/lib/api/types';
import { FeedStream } from './FeedStream';
import { SuggestedPlayers } from './SuggestedPlayers';

/*
 * Never in search results.
 *
 * Signing out of this page does not stop a crawler reaching it: unlike
 * `/dashboard`, `/feed` is not a `PROTECTED_PREFIXES` entry, so `proxy.ts` lets
 * the request through and the redirect happens *inside* the component — which
 * Next serves as a 200 with a meta refresh, not a 307. A crawler therefore gets
 * a real page: a title, the nav, and no content, because the feed API answers
 * 401 without a session and always will.
 *
 * `robots.txt` is the wrong tool for that (it governs fetching, not indexing),
 * and the root layout's default is `index, follow`. So the page says no here.
 * `follow` stays on: the nav links are worth crawling even though this page is
 * not worth indexing.
 */
export const metadata: Metadata = {
  title: 'Feed',
  robots: { index: false, follow: true },
};

const PAGE_SIZE = 6;

/**
 * The scout's and the academy manager's home: what to watch next.
 *
 * The first page is fetched here rather than in the client so the feed has clips
 * in the first paint — on a phone connection the difference between this and an
 * empty screen with a spinner is several seconds of doubt about whether the app
 * works.
 *
 * `no-store`, because the ranking is personal: it knows who this viewer follows
 * and what they have liked, and a shared cache would hand one scout another's
 * feed.
 *
 * Suggestions sit to the right on a laptop and below the stream on a phone, where
 * there is no "beside" — the clips are what the reader came for and they get the
 * top of the screen.
 */
export default async function FeedPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/feed');
  const { t } = await getServerT();

  const [firstPage, suggested] = await Promise.all([
    media
      .feed(1, PAGE_SIZE, { token: session?.accessToken, cache: 'no-store' })
      .catch(() => ({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE }) as FeedPageData),
    media
      .suggestedPlayers(6, { token: session?.accessToken, cache: 'no-store' })
      .catch(() => [] as SuggestedPlayer[]),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <h1 className="mb-1 text-xl font-bold tracking-tight">{t.feed.title}</h1>
        <p className="text-muted mb-4 text-sm">{t.feed.subtitle}</p>
        <FeedStream initialPage={firstPage} />
      </div>

      <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <SuggestedPlayers initial={suggested} />
      </aside>
    </div>
  );
}
