'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { browserFetch } from '@/lib/api/browser';
import type { RecordedVerdict } from '@/lib/api/resources';
import type { TrialApplication, TrialApplicationStatus, TrialVerdict } from '@/lib/api/types';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * The query keys whose rows carry a verdict. Patched in place when one is
 * written or taken back, so the card the coach just answered changes under
 * their thumb and nothing else on the screen moves.
 */
const APPLICATION_LISTS = ['trial-applications', 'coach-private-queue'] as const;

/** How long the Undo stays on screen. The API allows a little longer. */
const UNDO_TOAST_MS = 8_000;

interface ApplicationRow {
  id: string;
  status: TrialApplicationStatus;
  result?: TrialApplication['result'];
}

/**
 * Applies a change to one application wherever it is cached.
 *
 * Every list that shows verdicts is `{ items: [...] }` under one of the keys
 * above, so this walks those and leaves everything else alone. A row that is
 * not in a given list is simply not there — a private-trial queue does not
 * hold a global trial's applicant.
 */
function patchApplication(
  queryClient: QueryClient,
  applicationId: string,
  patch: Partial<ApplicationRow>,
) {
  queryClient.setQueriesData<{ items: ApplicationRow[] } | undefined>(
    {
      predicate: (query) =>
        APPLICATION_LISTS.includes(query.queryKey[0] as (typeof APPLICATION_LISTS)[number]),
    },
    (old) =>
      old && Array.isArray(old.items)
        ? {
            ...old,
            items: old.items.map((row) => (row.id === applicationId ? { ...row, ...patch } : row)),
          }
        : old,
  );
}

/**
 * Recording a verdict, and taking it back.
 *
 * ## Pass is immediate, and undoable
 *
 * A coach at the side of a pitch presses PASS with a thumb. There is no
 * confirmation: the API writes the verdict at once but acts on it only after
 * a short window (see the backend's trials.constants.ts), and the toast that
 * confirms the press carries **Undo** for that window. Undo is a real call —
 * `DELETE .../verdict` — that removes the verdict and the consequences queued
 * behind it; nothing here is pretend.
 *
 * ## Fail asks first
 *
 * A fail is confirmed in a dialog (`FailPlayerDialog`) with an optional note,
 * so the confirmation is where the question is asked, not here.
 *
 * ## The row updates in place
 *
 * Success patches the cached row rather than refetching the list: the card
 * shows ✓ Passed where the buttons were, and the next player stays exactly
 * where it was. The coach's trial counts are invalidated so the badges
 * elsewhere catch up.
 */
export function useVerdict() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: ['trials', 'coaching'] });
    void queryClient.invalidateQueries({ queryKey: ['profile-summary'] });
  };

  const undo = useMutation({
    mutationFn: (applicationId: string) =>
      browserFetch<TrialApplication>(`/trials/applications/${applicationId}/verdict`, {
        method: 'DELETE',
      }),
    onSuccess: (application) => {
      patchApplication(queryClient, application.id, { status: application.status, result: null });
      settle();
    },
    meta: { success: t.trials.verdictUndone },
  });

  const record = useMutation({
    mutationFn: ({
      applicationId,
      verdict,
      note,
    }: {
      applicationId: string;
      verdict: TrialVerdict;
      note?: string;
    }) =>
      browserFetch<RecordedVerdict>(`/trials/applications/${applicationId}/verdict`, {
        method: 'POST',
        body: { verdict, ...(note ? { note } : {}) },
      }),
    onSuccess: (result, { applicationId, verdict }) => {
      patchApplication(queryClient, applicationId, {
        status: verdict === 'PASS' ? 'PASSED' : 'FAILED',
        // The coach's own name is not worth a round trip on their own sheet.
        result: { ...result, coachUser: { id: '', firstName: null, lastName: null } },
      });
      settle();
      toast.success(verdict === 'PASS' ? t.trials.passedToast : t.trials.failedToast, {
        duration: UNDO_TOAST_MS,
        action: {
          label: t.common.undo,
          onClick: () => undo.mutate(applicationId),
        },
      });
    },
  });

  return {
    /** Records PASS or FAIL. Immediate; the caller decides whether to ask first. */
    record: (applicationId: string, verdict: TrialVerdict, note?: string) =>
      record.mutate({ applicationId, verdict, note }),
    /** The application a verdict is being written for right now, if any. */
    pendingId: record.isPending ? record.variables?.applicationId : undefined,
    undoingId: undo.isPending ? undo.variables : undefined,
  };
}
