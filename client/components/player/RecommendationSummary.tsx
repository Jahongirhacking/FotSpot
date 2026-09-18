'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { ReportRecommendationDialog } from '@/components/player/ReportRecommendationDialog';
import { LoadMore } from '@/components/trials/StageTabs';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { browserFetch } from '@/lib/api/browser';
import type { PlayerRecommendationEntry, PlayerRecommendationSummary } from '@/lib/api/resources';
import { RECOMMENDATION_PAGE_SIZE } from '@/lib/player-recommendations';
import { initials, relativeTime } from '@/lib/utils';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Flag, Megaphone, MoreHorizontal, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

/**
 * Who vouched for this player, and the public global weight — README §1.5.3.
 *
 * Shows `globalWeight` only. The per-academy extra earned by specific
 * recommendations stays inside that academy's own inbox: it is their private
 * working judgement, and §21.5 rules out public composite scores for minors.
 *
 * Which academies a scout named is shown, because that a scout vouched for a
 * player to a particular academy is the scout's own public act.
 *
 * Each scout is a link to their record when the reader is allowed one. "Who
 * vouched for me" is only half an answer without "and are they any good" —
 * §1.5 exists precisely so that a name carries a track record. `linkScouts` is
 * false for coaches, who must judge the player and not the messenger; see
 * `mayViewScoutProfile`.
 *
 * ## Three at a time
 *
 * The server sends the most credible scouts first, a page at a time, and the
 * first page arrives with the profile. A "load more" button, not a scroll
 * trigger: a well-recommended player can have dozens of these, and a card that
 * grows on its own pushes the coach assessments below it out from under the
 * reader. Pages are keyed by the player, so a report or a like elsewhere on
 * the profile never refetches this list.
 *
 * ## Report, on the item
 *
 * Every item carries a small menu with one action, Report. Reporting files a
 * moderation report and changes nothing here: the text stays until a
 * moderator decides, and the decision that hides it is made about the scout,
 * server-side, not by anything this card does.
 */
export function RecommendationSummary({
  playerId,
  initial,
  linkScouts = false,
}: {
  playerId: string;
  initial: PlayerRecommendationSummary;
  linkScouts?: boolean;
}) {
  const { t } = useI18n();

  const pages = useInfiniteQuery({
    queryKey: ['player-recommendations', playerId],
    queryFn: ({ pageParam }) =>
      browserFetch<PlayerRecommendationSummary>(
        `/recommendations/player/${playerId}?page=${pageParam}&pageSize=${RECOMMENDATION_PAGE_SIZE}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    initialData: { pages: [initial], pageParams: [1] },
    // The order came with the page; the list stays as the reader was dealt it.
    staleTime: Infinity,
  });

  const entries = React.useMemo(() => {
    // The same recommendation cannot be on two pages unless one was filed while
    // the reader was paging; keyed by id so it is still drawn once.
    const seen = new Set<string>();
    const rows: PlayerRecommendationEntry[] = [];
    for (const page of pages.data?.pages ?? []) {
      for (const entry of page.scouts ?? []) {
        if (seen.has(entry.recommendation.id)) continue;
        seen.add(entry.recommendation.id);
        rows.push(entry);
      }
    }
    return rows;
  }, [pages.data]);

  const first = pages.data?.pages[0] ?? initial;
  const total = pages.data?.pages.at(-1)?.total ?? initial.total;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="text-primary size-4" aria-hidden /> {t.recommendations.vouchedBy}
          </CardTitle>
          <CardDescription>{t.recommendations.globalWeightHint}</CardDescription>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-muted flex items-center justify-end gap-1 text-[10px] uppercase">
            <TrendingUp className="size-3" aria-hidden /> {t.recommendations.globalWeight}
          </p>
          <p className="text-primary text-2xl leading-tight font-bold">
            {Math.round((first?.globalWeight ?? 0) * 10) / 10}
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {entries.length === 0 ? (
          <p className="text-muted text-sm">{t.recommendations.noRecommendationsYet}</p>
        ) : (
          <ul className="divide-border divide-y">
            {entries.map((entry) => (
              <RecommendationItem key={entry.recommendation.id} entry={entry} linked={linkScouts} />
            ))}
          </ul>
        )}

        {pages.isError && <Alert tone="danger">{t.common.couldNotLoad}</Alert>}

        <LoadMore
          shown={entries.length}
          total={total}
          loading={pages.isFetchingNextPage}
          onLoadMore={() => {
            if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
          }}
        />
      </CardContent>
    </Card>
  );
}

function RecommendationItem({
  entry: { id, name, avatarUrl, recommendation },
  linked,
}: {
  entry: PlayerRecommendationEntry;
  linked: boolean;
}) {
  const { t } = useI18n();
  const requireAuth = useRequireAuth();
  const [reporting, setReporting] = React.useState(false);

  return (
    <li className="flex items-start gap-3 py-3">
      <ScoutIdentity
        id={id}
        name={name}
        avatarUrl={avatarUrl}
        linked={linked}
        label={t.scouts.viewProfile}
      />

      <div className="min-w-0 flex-1">
        <ScoutName id={id} name={name} linked={linked} />
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant={recommendation?.type === 'SPECIFIC' ? 'primary' : 'neutral'}>
            {recommendation?.type === 'SPECIFIC'
              ? t.recommendations.specificType
              : t.recommendations.globalType}
          </Badge>
          <span className="text-muted text-xs">{relativeTime(recommendation?.date)}</span>
        </div>
        {recommendation?.note && (
          <p className="text-muted mt-1.5 text-xs italic">“{recommendation?.note}”</p>
        )}
      </div>

      {/* The scout's §1.5 weight as it stood when they filed — not a live
          lookup, so this number never silently changes. */}
      <span
        className="text-muted shrink-0 pt-0.5 font-mono text-sm"
        title={t.recommendations.globalWeight}
      >
        +{recommendation?.weight}
      </span>

      {/* Guests may read the list; the action asks them to sign in first. */}
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label={t.recommendations.moreActions}
            className="text-muted hover:bg-surface-2 hover:text-foreground focus-visible:ring-primary -mr-2 grid size-9 shrink-0 place-items-center rounded-full transition focus-visible:ring-2 focus-visible:outline-none"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
        </MenuTrigger>
        <MenuContent className="min-w-40">
          <MenuItem
            onSelect={() => {
              if (requireAuth()) setReporting(true);
            }}
          >
            <Flag aria-hidden /> {t.recommendations.report}
          </MenuItem>
        </MenuContent>
      </Menu>

      <ReportRecommendationDialog
        recommendationId={recommendation.id}
        open={reporting}
        onOpenChange={setReporting}
      />
    </li>
  );
}

/**
 * The avatar, wrapped in a link only when the reader may follow it.
 *
 * Rendered as a plain span otherwise rather than a disabled link: a link that
 * goes nowhere is a worse answer than no link, and a coach is not being denied
 * anything they were told about.
 */
function ScoutIdentity({
  id,
  name,
  avatarUrl,
  linked,
  label,
}: {
  id: string;
  name: string;
  avatarUrl: string | null;
  linked: boolean;
  label: string;
}) {
  const avatar = (
    <Avatar src={avatarUrl} fallback={initials(...splitName(name))} className="size-9" />
  );

  if (!linked) return avatar;

  return (
    <Link
      href={`/scouts/${id}`}
      aria-label={label}
      className="focus-visible:ring-primary shrink-0 rounded-full focus-visible:ring-2 focus-visible:outline-none"
    >
      {avatar}
    </Link>
  );
}

function ScoutName({ id, name, linked }: { id: string; name: string; linked: boolean }) {
  const label = name || id.slice(0, 8);
  if (!linked) return <p className="truncate text-sm font-medium">{label}</p>;

  return (
    <p className="truncate text-sm font-medium">
      <Link href={`/scouts/${id}`} className="hover:text-primary hover:underline">
        {label}
      </Link>
    </p>
  );
}

function splitName(name: string): [string, string] {
  const [first = '', last = ''] = name.split(' ');
  return [first, last];
}
