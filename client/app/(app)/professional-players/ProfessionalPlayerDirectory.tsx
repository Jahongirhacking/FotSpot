'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { ProfessionalPlayerGrid } from '@/components/professional/ProfessionalPlayerGrid';
import { LoadMore } from '@/components/trials/StageTabs';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { browserFetch } from '@/lib/api/browser';
import type { Page } from '@/lib/api/client';
import type { ProfessionalPlayer } from '@/lib/api/types';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search, Star } from 'lucide-react';
import * as React from 'react';

export const PROFESSIONAL_PAGE_SIZE = 24;

/**
 * Search box over a paged grid. The first page of the unfiltered list arrives
 * with the page; a search is its own query, debounced so the list is not
 * re-fetched per keystroke.
 */
export function ProfessionalPlayerDirectory({
  initial,
}: {
  initial: Page<ProfessionalPlayer> | null;
}) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const list = useInfiniteQuery({
    queryKey: ['professional-players', search],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      browserFetch<Page<ProfessionalPlayer>>(
        `/professional-players?page=${pageParam}&pageSize=${PROFESSIONAL_PAGE_SIZE}` +
          (search ? `&query=${encodeURIComponent(search)}` : ''),
      ),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    ...(search === '' && initial ? { initialData: { pages: [initial], pageParams: [1] } } : {}),
  });

  const players = React.useMemo(
    () => (list.data?.pages ?? []).flatMap((page) => page.items),
    [list.data],
  );
  const total = list.data?.pages.at(-1)?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.professional.search}
          aria-label={t.professional.search}
          className="pl-9"
        />
      </div>

      {list.isError ? (
        <Alert tone="danger">{t.common.couldNotLoad}</Alert>
      ) : list.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : players.length === 0 ? (
        <EmptyState
          icon={Star}
          title={search ? t.professional.noResults : t.professional.empty}
          description={search ? undefined : t.professional.emptyHint}
        />
      ) : (
        <>
          <ProfessionalPlayerGrid players={players} />
          <LoadMore
            shown={players.length}
            total={total}
            loading={list.isFetchingNextPage}
            onLoadMore={() => {
              if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
            }}
          />
        </>
      )}
    </div>
  );
}
