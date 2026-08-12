'use client';

import * as React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyMemberRole } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Field';
import { ageFrom, cn, initials } from '@/lib/utils';

interface Candidate {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  avatarUrl: string | null;
  primaryPosition: string | null;
  birthDate: string | null;
}

const PAGE_SIZE = 20;
/** Must match the row's rendered height, or the windowing maths drifts. */
const ROW_HEIGHT = 56;
const VIEWPORT_HEIGHT = 280;
/** Rows kept mounted beyond the viewport so a fast scroll does not show gaps. */
const OVERSCAN = 4;

/**
 * Choosing an account to invite, out of however many there are.
 *
 * ## Why not a `<select>`
 *
 * The picker used to be a native select over the first hundred accounts. On a
 * platform with thousands of players that is not a shortlist, it is an arbitrary
 * hundred — and the person you are looking for is probably not in it. Searching
 * is the only thing that makes this list usable, so it is the first control.
 *
 * ## Paged and windowed, which are different problems
 *
 * Paging keeps the response small: twenty rows at a time, the next page fetched
 * when the scroll approaches the end. Windowing keeps the DOM small: only the
 * rows inside the viewport (plus a few) are mounted, however many have been
 * fetched. Either one alone still ends badly — all the data and a thousand
 * nodes, or few nodes and a response nobody wants to download.
 */
export function CandidatePicker({
  academyId,
  role,
  value,
  onChange,
}: {
  academyId: string;
  role: AcademyMemberRole;
  value: string;
  onChange: (userId: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [scrollTop, setScrollTop] = React.useState(0);
  const viewport = React.useRef<HTMLDivElement>(null);

  // Typed characters are held back so the list is not re-queried per keystroke;
  // 250ms is under the pause between words, so it reads as instant.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      // A new search is a new list, so the old scroll offset means nothing —
      // reset both the element and the offset the windowing reads.
      viewport.current?.scrollTo({ top: 0 });
      setScrollTop(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const list = useInfiniteQuery({
    queryKey: ['join-candidates', academyId, role, search],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      browserFetch<{ items: Candidate[]; total: number; page: number; pageSize: number }>(
        `/academies/${academyId}/candidates?role=${role}&page=${pageParam}&pageSize=${PAGE_SIZE}` +
          (search ? `&query=${encodeURIComponent(search)}` : ''),
      ),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });

  const rows = React.useMemo(
    () => (list.data?.pages ?? []).flatMap((page) => page.items),
    [list.data],
  );
  const total = list.data?.pages[0]?.total ?? 0;

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(
    rows?.length,
    Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN,
  );
  const visible = rows?.slice(first, last);

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    setScrollTop(element.scrollTop);
    // Fetch a page before the bottom is reached, so the list does not stall
    // under the thumb.
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining < ROW_HEIGHT * 4 && list.hasNextPage && !list.isFetchingNextPage) {
      void list.fetchNextPage();
    }
  }

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <div className="border-border relative border-b p-2">
        <Search
          className="text-muted pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.player.searchByName}
          aria-label={t.player.searchByName}
          className="pl-9"
        />
      </div>

      <div
        ref={viewport}
        onScroll={onScroll}
        role="listbox"
        aria-label={t.academy.choosePerson}
        className="overflow-y-auto"
        style={{ height: VIEWPORT_HEIGHT }}
      >
        {rows?.length === 0 ? (
          <p className="text-muted p-4 text-center text-sm">
            {list.isLoading ? t.common.loading : t.academy.noCandidates}
          </p>
        ) : (
          // The spacer div carries the full height so the scrollbar reflects the
          // whole list; the mounted rows are positioned into their slot in it.
          <div style={{ height: rows?.length * ROW_HEIGHT, position: 'relative' }}>
            <div style={{ transform: `translateY(${first * ROW_HEIGHT}px)` }}>
              {visible.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  role="option"
                  aria-selected={candidate.id === value}
                  onClick={() => onChange(candidate.id)}
                  style={{ height: ROW_HEIGHT }}
                  className={cn(
                    'hover:bg-surface-2 flex w-full items-center gap-3 px-3 text-left transition-colors',
                    candidate.id === value && 'bg-primary/10',
                  )}
                >
                  <Avatar
                    src={candidate.avatarUrl}
                    fallback={initials(candidate.firstName ?? '', candidate.lastName ?? '')}
                    className="size-8 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {[candidate.firstName, candidate.lastName].filter(Boolean).join(' ') ||
                        candidate.username}
                    </span>
                    <span className="text-muted block truncate text-xs">
                      {[
                        candidate.birthDate ? `${ageFrom(candidate.birthDate)}` : null,
                        candidate.primaryPosition,
                        candidate.username ? `@${candidate.username}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {candidate.id === value && (
                    <Check className="text-primary size-4 shrink-0" aria-hidden />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {rows?.length > 0 && (
        <p className="text-muted border-border border-t px-3 py-1.5 text-xs">
          {rows?.length} / {total}
        </p>
      )}
    </div>
  );
}
