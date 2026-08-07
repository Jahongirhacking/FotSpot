import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { players } from '@/lib/api/resources';
import { getServerT } from '@/lib/i18n/server';
import { getSession } from '@/lib/session';
import type { PlayingStyle } from '@/lib/api/types';
import { PlayerFilters } from './PlayerFilters';
import { PlayerResultCard } from './PlayerResultCard';
import { EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/shared/Pagination';

/** The tab title is translated like the page under it — see app/layout.tsx. */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: t.nav.players };
}

/**
 * Search is URL-driven, not stored in Zustand (client/CLAUDE.md §8) — so a filtered
 * search is shareable, back-button-safe, and rendered on the server.
 *
 * NOTE (Next 16): `searchParams` is a Promise.
 */
export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string;
    region?: string;
    position?: string;
    playingStyle?: string;
    minAge?: string;
    maxAge?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const { t, f } = await getServerT();
  const session = await getSession();
  const page = Number(params.page ?? 1) || 1;

  const result = await players
    .search(
      {
        query: params.query,
        region: params.region,
        position: params.position,
        playingStyle: params.playingStyle as PlayingStyle | undefined,
        minAge: params.minAge ? Number(params.minAge) : undefined,
        maxAge: params.maxAge ? Number(params.maxAge) : undefined,
        page,
        pageSize: 12,
      },
      session ? { token: session.accessToken, cache: 'no-store' } : { revalidate: 60 },
    )
    .catch(() => ({ items: [], total: 0, page, pageSize: 12 }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold">{t.player.findPlayers}</h1>
        <p className="text-muted text-sm">{f(t.player.searchSubtitle, { count: result.total })}</p>
      </header>

      <PlayerFilters />

      {result.items.length === 0 ? (
        <EmptyState icon={Users} title={t.player.noMatches} description={t.player.noMatchesHint} />
      ) : (
        <>
          {/* Cards are portrait, so more of them fit per row than the old list
              rows did — four across on a laptop, two on a phone. */}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {result.items.map((player) => (
              <li key={player.id}>
                <PlayerResultCard player={player} />
              </li>
            ))}
          </ul>
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} />
        </>
      )}
    </div>
  );
}
