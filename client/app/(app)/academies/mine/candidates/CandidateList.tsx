'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Page } from '@/lib/api/client';
import type { PendingAction } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/shared/Pagination';
import { CandidateCard, useCandidateActions } from '@/components/trials/CandidateCard';

/**
 * The paged list of candidates, with the same card and the same two answers
 * as the dashboard. The page number lives in the URL, so a manager who
 * answered three players on page two and reloads is still on page two.
 */
export function CandidateList({
  page,
  pageSize,
  initial,
}: {
  page: number;
  pageSize: number;
  initial: Page<PendingAction>;
}) {
  const { t } = useI18n();
  const actions = useCandidateActions();

  const candidates = useQuery({
    queryKey: ['manager-pending-actions', { page, pageSize }],
    queryFn: () =>
      browserFetch<Page<PendingAction>>(
        `/recommendations/manager/pending-actions?page=${page}&pageSize=${pageSize}`,
      ),
    initialData: initial,
  });

  const items = candidates.data?.items ?? [];
  const total = candidates.data?.total ?? 0;

  return (
    <div className="space-y-4">
      {actions.error && (
        <Alert tone="danger">{actions.error.message ?? t.common.somethingWrong}</Alert>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={t.academy.noWaitingCandidates}
          description={t.academy.noWaitingCandidatesHint}
        />
      ) : (
        <>
          <p className="text-muted flex items-center gap-2 text-sm">
            {t.dashboard.pendingActions} <Badge variant="warning">{total}</Badge>
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        </>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
