import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { players } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import type { PlayingStyle } from '@/lib/api/types';
import { PlayerFilters } from './PlayerFilters';
import { PlayerResultCard } from './PlayerResultCard';
import { EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/shared/Pagination';

export const metadata: Metadata = { title: 'Players' };

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
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const page = Number(params.page ?? 1) || 1;

  const result = await players
    .search(
      {
        query: params.query,
        region: params.region,
        position: params.position,
        playingStyle: params.playingStyle as PlayingStyle | undefined,
        page,
        pageSize: 12,
      },
      session ? { token: session.accessToken, cache: 'no-store' } : { revalidate: 60 },
    )
    .catch(() => ({ items: [], total: 0, page, pageSize: 12 }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold">Find players</h1>
        <p className="text-muted text-sm">
          {result.total} player{result.total === 1 ? '' : 's'} on FotSpot. Search by role, not just
          position.
        </p>
      </header>

      <PlayerFilters />

      {result.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No players match that"
          description="Try widening the filters — the platform is still growing region by region."
        />
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
