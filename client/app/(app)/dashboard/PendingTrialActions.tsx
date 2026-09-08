'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, Skeleton } from '@/components/ui/Feedback';
import { CandidateCard, useCandidateActions } from '@/components/trials/CandidateCard';
import { browserFetch } from '@/lib/api/browser';
import type { PendingAction } from '@/lib/api/types';
import type { Page } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';

/** How many candidates the dashboard shows before pointing at the full page. */
const SHOWN = 4;

/**
 * What the academy owes an answer on.
 *
 * ## Derived from state, never from notifications
 *
 * A notification says something *happened*; this says something is *owed*. Built
 * from unread notifications the list would empty exactly when the manager marked
 * them read — which is the moment they still have all the work to do. So the API
 * reads the rows that make each action true (a PASSED application with no
 * squad invitation out), and an item disappears because the manager acted, not
 * because they scrolled past it.
 *
 * ## The latest four, and the rest behind a link
 *
 * The dashboard is a glance, not a queue. It shows the newest passes and says
 * how many there are in all; the candidates page has every one, paged, with
 * the same two answers on each.
 */
export function PendingTrialActions() {
  const { t, f } = useI18n();
  const actions = useCandidateActions();

  const pending = useQuery({
    queryKey: ['manager-pending-actions', { page: 1, pageSize: SHOWN }],
    queryFn: () =>
      browserFetch<Page<PendingAction>>(
        `/recommendations/manager/pending-actions?page=1&pageSize=${SHOWN}`,
      ),
  });

  // Nothing owed is the ordinary state of a caught-up academy, and a card saying
  // so on every load would be furniture. The section simply is not there.
  if (pending?.isLoading) return <Skeleton className="h-28 w-full rounded-lg" />;
  const items = pending?.data?.items ?? [];
  const total = pending?.data?.total ?? items.length;
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="text-primary size-4" aria-hidden />{' '}
          {t.dashboard.pendingActions}
          <Badge variant="warning">{total}</Badge>
        </CardTitle>
        <CardDescription>{t.dashboard.pendingActionsHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.error && (
          <Alert tone="danger">{actions.error.message ?? t.common.somethingWrong}</Alert>
        )}

        {/*
          Cards, not rows: each is a person the manager is about to bring into
          the club, and the decision deserves a face, the exact age and the
          trial they passed — read at a glance, one card per player.
        */}
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <CandidateCard
              key={item?.applicationId}
              item={item}
              inviting={actions.inviting(item?.applicationId)}
              cancelling={actions.cancelling(item?.applicationId)}
              onInvite={() => actions.invite.mutate(item?.applicationId)}
              onCancel={(note) =>
                actions.cancel.mutate({ applicationId: item?.applicationId, note })
              }
            />
          ))}
        </ul>

        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
          <Link href="/academies/mine/candidates">
            {f(t.dashboard.seeAllCandidates, { count: total })} <ArrowRight aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
