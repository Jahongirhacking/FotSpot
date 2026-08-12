'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, History, Lock, MapPin } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Page } from '@/lib/api/client';
import type { Trial } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { formatDate } from '@/lib/utils';

const PAGE_SIZE = 10;

/**
 * Everything this academy has finished, a page at a time.
 *
 * ## Why it is separate from the working lists
 *
 * A trial archives itself once every applicant has a verdict, which means the
 * history is the only list that never stops growing. Left in with the live ones
 * it would bury them within a season — and the two answer different questions:
 * the working lists are things to do, this is a record to look something up in.
 *
 * ## Why paginated rather than capped
 *
 * "The U14 morning from two springs ago" is exactly what a history is for. A
 * hard limit would make the oldest trials unreachable, and with them the
 * applications attached — decisions somebody made about a child, which is the
 * reason nothing here is ever deleted.
 */
export function TrialHistory({ academyId }: { academyId: string }) {
  const { t } = useI18n();
  const [page, setPage] = React.useState(1);

  const history = useQuery({
    queryKey: ['trial-history', academyId, page],
    queryFn: () =>
      browserFetch<Page<Trial>>(
        `/trials/academy/${academyId}/history?page=${page}&pageSize=${PAGE_SIZE}`,
      ),
    // The previous page stays on screen while the next one loads, so paging does
    // not flash an empty card between presses.
    placeholderData: (previous) => previous,
  });

  const rows = history.data?.items ?? [];
  const total = history.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="text-muted size-4" aria-hidden />
          {t.trials.history}
          {total > 0 && <Badge variant="neutral">{total}</Badge>}
        </CardTitle>
        <p className="text-muted text-sm">{t.trials.historyHint}</p>
      </CardHeader>

      <CardContent className="space-y-3 p-2">
        {history.isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : rows?.length === 0 ? (
          <EmptyState
            icon={History}
            title={t.trials.noHistory}
            description={t.trials.noHistoryHint}
          />
        ) : (
          <>
            <ul className="divide-border divide-y">
              {rows?.map((trial) => (
                <li key={trial?.id}>
                  <Link
                    href={`/trials/${trial?.id}`}
                    className="hover:bg-surface-2 flex flex-wrap items-center gap-3 rounded-lg p-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{trial?.title}</span>
                        {trial?.type === 'PRIVATE' && (
                          <Badge variant="warning">
                            <Lock className="size-3" aria-hidden /> {t.trials.typePrivate}
                          </Badge>
                        )}
                      </span>
                      <span className="text-muted flex flex-wrap items-center gap-2 text-xs">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="size-3" aria-hidden /> {formatDate(trial?.date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" aria-hidden /> {trial?.location}
                        </span>
                      </span>
                    </span>
                    <Badge variant="neutral" className="shrink-0">
                      {t.trials.statusArchived}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>

            {lastPage > 1 && (
              <div className="flex items-center justify-between gap-2 px-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft aria-hidden /> {t.common.previous}
                </Button>
                <span className="text-muted text-xs tabular-nums">
                  {t.common.page} {page} {t.common.of} {lastPage}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= lastPage}
                  onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
                >
                  {t.common.next} <ChevronRight aria-hidden />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
