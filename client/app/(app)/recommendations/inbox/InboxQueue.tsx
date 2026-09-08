'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Mail, ShieldCheck, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyHistoryRow, RankedRecommendation } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { ageBand, formatDate } from '@/lib/utils';
import {
  EMPTY_INBOX_FILTERS,
  filterInbox,
  InboxFilters,
  type InboxFilterState,
} from './InboxFilters';
import { InviteToPrivateTrialDialog } from '@/components/trials/InviteToPrivateTrialDialog';

/**
 * The manager's inbox: players scouts have put forward, and the one decision
 * about each.
 *
 * ## One decision, made on the pitch
 *
 * A manager does not judge football from a profile — a trial does (TRIAL.md
 * §11). So an inbox row offers exactly two things: invite the player to a
 * private trial, which creates the session and hands it to a coach, or turn the
 * recommendation down. There is no online step in between; the trial's verdict
 * is what settles the scouts who put the player forward.
 *
 * Invited and rejected players leave the queue for the history below: an inbox
 * you cannot empty stops being a queue.
 *
 * ## Why the row carries the recommendation
 *
 * The invitation is sent with `recommendationId`, so the trial that follows
 * knows which recommendation it answers and the history can say so. Several
 * scouts may have recommended the same player; the API snapshots all of them
 * as the trial's backings, and the one named here is only the row the manager
 * was looking at.
 */
export function InboxQueue({
  academyId,
  initialItems,
  initialHistory,
}: {
  academyId: string;
  initialItems: RankedRecommendation[];
  initialHistory: AcademyHistoryRow[];
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [filters, setFilters] = React.useState<InboxFilterState>(EMPTY_INBOX_FILTERS);

  const inbox = useQuery({
    queryKey: ['inbox-ranked', academyId],
    queryFn: () =>
      browserFetch<{ items: RankedRecommendation[] }>(
        `/recommendations/academy/${academyId}/ranked`,
      ),
    initialData: { items: initialItems },
  });

  const history = useQuery({
    queryKey: ['inbox-history', academyId],
    queryFn: () =>
      browserFetch<AcademyHistoryRow[]>(`/recommendations/academy/${academyId}/history`),
    initialData: initialHistory,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['inbox-ranked', academyId] });
    void queryClient.invalidateQueries({ queryKey: ['inbox-history', academyId] });
    void queryClient.invalidateQueries({ queryKey: ['inbox-count'] });
  };

  /*
   * Turning a player down answers every recommendation that put them here.
   * Sequential, not parallel: each answer recomputes a scout's reputation
   * server-side, and a burst of concurrent writes to the same stats rows is
   * needless contention.
   */
  const reject = useMutation({
    mutationFn: async (item: RankedRecommendation) => {
      for (const id of item.recommendationIds) {
        await browserFetch(`/recommendations/${id}/status`, {
          method: 'PATCH',
          body: { status: 'REJECTED' },
        });
      }
    },
    onSuccess: refresh,
    meta: { success: t.recommendations.rejected },
  });

  const items = inbox.data?.items ?? [];
  const historyRows = history.data ?? [];

  // One bar over both lists: a manager looking for a name does not know, and
  // should not have to know, whether that player has been answered yet.
  const shown = filterInbox(items, filters);
  const shownHistory = filterInbox(historyRows, filters);

  return (
    <div className="space-y-6">
      <InboxFilters rows={[...items, ...historyRows]} value={filters} onChange={setFilters} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="text-primary size-4" aria-hidden />
            {t.recommendations.fromEndorsedScouts}
            {shown.length > 0 && <Badge variant="neutral">{shown.length}</Badge>}
          </CardTitle>
          <p className="text-muted text-sm">{t.recommendations.inboxFlowHint}</p>
        </CardHeader>

        <CardContent className="p-2">
          {shown.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={items.length === 0 ? t.recommendations.inboxEmpty : t.player.noMatches}
              description={
                items.length === 0 ? t.recommendations.inboxEmptyHint : t.player.noMatchesHint
              }
            />
          ) : (
            <ul className="divide-border divide-y">
              {shown.map((item) => (
                <InboxRow
                  key={item?.playerId}
                  item={item}
                  academyId={academyId}
                  // Only the row actually being answered, not the whole list.
                  rejecting={reject.isPending && reject.variables?.playerId === item?.playerId}
                  onReject={() => {
                    const name = item?.player
                      ? `${item.player.firstName} ${item.player.lastName}`
                      : item?.playerId;
                    if (window.confirm(t.recommendations.confirmReject.replace('{name}', name))) {
                      reject.mutate(item);
                    }
                  }}
                  onInvited={refresh}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.recommendations.history}</CardTitle>
          <p className="text-muted text-sm">{t.recommendations.historyHint}</p>
        </CardHeader>
        <CardContent className="p-2">
          {shownHistory.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title={historyRows.length === 0 ? t.recommendations.historyEmpty : t.player.noMatches}
              // Two different empties: nothing has happened yet, or a filter hid
              // it. Saying which is the difference between waiting and clearing
              // the search box.
              description={
                historyRows.length === 0
                  ? t.recommendations.historyEmptyHint
                  : t.player.noMatchesHint
              }
            />
          ) : (
            <ul className="divide-border divide-y">
              {shownHistory.map((row) => (
                <li key={row?.recommendationId} className="flex flex-wrap items-center gap-3 p-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/players/${row?.player?.id ?? ''}`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {row?.player?.firstName} {row?.player?.lastName}
                    </Link>
                    <p className="text-muted truncate text-xs">
                      {[
                        row?.player?.primaryPosition,
                        row?.player?.birthDate && ageBand(row?.player.birthDate),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      {' · '}
                      {formatDate(row?.decidedAt)}
                    </p>
                  </div>
                  {/* Three outcomes, not two. "Invited" is what most rows here
                      are: the academy acted, and the trial will answer the
                      recommendation later. */}
                  <Badge
                    variant={
                      row?.invitation
                        ? 'primary'
                        : row?.status === 'ACCEPTED'
                          ? 'success'
                          : 'neutral'
                    }
                  >
                    {row?.invitation ? (
                      <Link href={`/trials/${row.invitation.trialId}`} className="hover:underline">
                        {t.recommendations.invited}
                        {row.invitation.date ? ` · ${formatDate(row.invitation.date)}` : ''}
                      </Link>
                    ) : row?.status === 'ACCEPTED' ? (
                      t.recommendations.statusAccepted
                    ) : (
                      t.recommendations.rejected
                    )}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InboxRow({
  item,
  academyId,
  rejecting,
  onReject,
  onInvited,
}: {
  item: RankedRecommendation;
  academyId: string;
  rejecting: boolean;
  onReject: () => void;
  onInvited: () => void;
}) {
  const { t, f } = useI18n();
  const name = item?.player ? `${item?.player.firstName} ${item?.player.lastName}` : item?.playerId;

  return (
    <li className="flex flex-wrap items-center gap-2 p-2">
      <Link href={`/players/${item?.playerId}`} className="min-w-0 flex-1 hover:underline">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="text-muted block truncate text-xs">
          {[
            item?.player?.primaryPosition,
            item?.player && ageBand(item?.player.birthDate),
            item?.player?.region,
          ]
            .filter(Boolean)
            .join(' · ')}
          {' · '}
          {f(t.recommendations.backedBy, { count: item?.recommendationCount })}
        </span>
      </Link>

      {/*
       * The two answers, and nothing between them. The invitation opens the
       * dialog — a date, a place, a coach — because sending it is what creates
       * the trial; the refusal asks once, since it answers every scout who put
       * this player forward.
       */}
      <div className="flex shrink-0 items-center gap-1">
        <InviteToPrivateTrialDialog
          playerId={item?.playerId}
          playerName={name}
          academyId={academyId}
          role="MANAGER"
          recommendationId={item?.recommendationIds?.[0]}
          onInvited={onInvited}
          trigger={
            <Button size="sm" variant="violet">
              <Mail aria-hidden /> {t.recommendations.inviteToPrivateTrial}
            </Button>
          }
        />
        <Button
          size="icon"
          variant="ghost"
          aria-label={t.recommendations.rejectPlayer}
          title={t.recommendations.rejectPlayer}
          loading={rejecting}
          onClick={onReject}
        >
          <X className="text-danger" aria-hidden />
        </Button>
      </div>
    </li>
  );
}
