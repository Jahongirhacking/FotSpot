'use client';

import * as React from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { browserFetch } from '@/lib/api/browser';
import type { ApplicationStage } from '@/lib/api/types';

export interface StagePage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<ApplicationStage, number>;
  /** Invitations awaiting an answer — sent by the applicants endpoint only. */
  pending?: number;
}

/** The query key one stage of one list lives under — shared with the cache patches. */
export const stagePagesKey = (
  list: 'trial-applications' | 'private-trials',
  id: string,
  stage: ApplicationStage | null,
) => [list, id, stage ?? 'ALL'] as const;

/**
 * One stage of a list, a page at a time, fetched only when asked for.
 *
 * ## Why the lists are not read whole
 *
 * An open day collects hundreds of applications and a season of private
 * trials runs to hundreds more, and every one of those rows carried a
 * player, a photograph and a verdict. Reading the lot to draw one tab was
 * the whole cost of the screen, and it grew every week. So each tab is its
 * own query — nothing is fetched for a tab nobody opened — and each query
 * is a page at a time, the next page on request. The API cuts the page, so
 * the rows it does not send are rows it did not read.
 *
 * ## The counts
 *
 * Every page says how many sit at every stage, so the tabs read right
 * before they are opened. The last counts seen are kept while the next tab
 * loads, so the numbers do not blink to nothing on every switch.
 */
export function useStagePages<T>({
  list,
  id,
  path,
  stage,
  pageSize = 20,
  initial,
  enabled = true,
}: {
  list: 'trial-applications' | 'private-trials';
  id: string;
  /** The API path, without the query string. */
  path: string;
  /** Null for every stage at once. */
  stage: ApplicationStage | null;
  pageSize?: number;
  /** The first page, when the server rendered it. */
  initial?: StagePage<T>;
  enabled?: boolean;
}) {
  const query = useInfiniteQuery({
    queryKey: stagePagesKey(list, id, stage),
    queryFn: ({ pageParam }) =>
      browserFetch<StagePage<T>>(
        `${path}?page=${pageParam}&pageSize=${pageSize}${stage ? `&stage=${stage}` : ''}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    initialData: initial
      ? ({ pages: [initial], pageParams: [1] } satisfies InfiniteData<StagePage<T>, number>)
      : undefined,
    enabled,
  });

  const pages = React.useMemo(() => query.data?.pages ?? [], [query.data]);
  const rows = React.useMemo(() => pages.flatMap((page) => page.items), [pages]);
  const latest = pages[pages.length - 1];

  /*
   * The counts outlive the tab they came from — see above. Read from the
   * cache rather than remembered here: every stage of this list carries the
   * same counts, so while the open tab loads, the freshest page of any
   * sibling stage answers. No state, no effect, nothing to keep in step.
   */
  const queryClient = useQueryClient();
  const counts = React.useMemo(() => {
    if (latest?.counts) return latest.counts;
    const siblings = queryClient
      .getQueriesData<InfiniteData<StagePage<T>, number>>({ queryKey: [list, id] })
      .map(([, data]) => data?.pages?.[data.pages.length - 1]?.counts)
      .filter((found): found is Record<ApplicationStage, number> => Boolean(found));
    return siblings[siblings.length - 1] ?? {};
  }, [latest, queryClient, list, id]);

  return {
    rows,
    counts,
    total: latest?.total ?? 0,
    /** The first page, for what is not a row — `pending`, say. */
    first: pages[0],
    isLoading: query.isLoading,
    isError: query.isError,
    hasMore: Boolean(query.hasNextPage),
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
  };
}
