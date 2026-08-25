'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Check, Send, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { TrialApplicationStatus } from '@/lib/api/types';
import { useSession } from '@/components/layout/SessionProvider';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Card, CardContent } from '@/components/ui/Card';
import { formatDate } from '@/lib/utils';

/**
 * Only players apply. A non-player sees the route to becoming one instead of a
 * disabled button with no explanation — this is the just-in-time role prompt from
 * README §1.2.2, at the exact moment it carries its own motivation.
 */
export function ApplyToTrialButton({
  trialId,
  existingStatus,
  applicationId,
  ageRange,
  applyDeadline,
}: {
  trialId: string;
  existingStatus: TrialApplicationStatus | null;
  /** This player's application on this trial, when they have one. */
  applicationId?: string | null;
  /** Null on a trial that states no age rule. */
  ageRange: { min: number; max: number } | null;
  /** Null on trials written before deadlines existed — those stay open. */
  applyDeadline?: string | null;
}) {
  const { t, f } = useI18n();
  const { hasRole, isAuthenticated } = useSession();
  const requireAuth = useRequireAuth();
  const router = useRouter();

  const closed = Boolean(applyDeadline && new Date(applyDeadline) < new Date());

  const apply = useMutation({
    mutationFn: () => browserFetch(`/trials/${trialId}/apply`, { method: 'POST' }),
    // `router.refresh()` rather than a full reload: the page is server-rendered,
    // so this re-runs it with the new application state — and a hard reload
    // would throw away the confirmation before anybody could read it.
    onSuccess: () => router.refresh(),
    meta: { success: t.trials.applicationSent },
  });

  /** The player's yes or no — the one step nobody can take for them. */
  const respond = useMutation({
    mutationFn: (accept: boolean) =>
      browserFetch(`/trials/applications/${applicationId}/respond`, {
        method: 'POST',
        body: { accept },
      }),
    meta: { success: t.trials.answerSent },
    onSuccess: () => router.refresh(),
  });

  // A guest is asked to sign in; only a signed-in non-player is told they need a
  // card, because only then is that actually the missing step.
  if (!isAuthenticated) {
    return (
      <Button size="lg" className="w-full" onClick={() => requireAuth()}>
        <Send aria-hidden /> {t.trials.apply}
      </Button>
    );
  }

  if (!hasRole('player')) {
    return (
      <Card className="border-primary/30">
        <CardContent className="space-y-3 p-5">
          <p className="font-medium">{t.trials.needsCard}</p>
          <p className="text-muted text-sm">
            It takes about a minute, and the academy sees your card with your application.
          </p>
          <Button asChild>
            <Link href="/onboarding/player">{t.dashboard.setUpMyCard}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  /*
   * Already applied: the status, whether or not the deadline has passed.
   *
   * Checked before the deadline, because somebody who got in on time should see
   * where they stand rather than "applications closed" — which would read as if
   * they had missed it.
   */
  /*
   * An invitation is a question, so this page has to let them answer it.
   *
   * The notification a player gets links here, and a private trial cannot be
   * applied to — so this is the page they land on holding an invitation. It used
   * to render the status line below and stop, which left them reading
   * "Application status: Invited" with nothing to press: the accept and decline
   * buttons existed only in the list on /trials, which nothing told them to go
   * back to. That is a dead end at the exact step the whole flow waits on.
   *
   * The same endpoint the list uses, so there is one answer path and not two.
   */
  if (existingStatus === 'INVITED') {
    return (
      <Card className="border-primary/30">
        <CardContent className="space-y-3 p-5">
          <p className="font-medium">{t.trials.yourInvitation}</p>
          <p className="text-muted text-sm">{t.trials.invitationNeedsAnswer}</p>

          {respond.isError && (
            <Alert tone="danger">
              {(respond.error as Error)?.message ?? t.common.somethingWrong}
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              className="flex-1"
              loading={respond.isPending && respond.variables === true}
              onClick={() => respond.mutate(true)}
            >
              <Check aria-hidden /> {t.trials.acceptInvitation}
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              disabled={respond.isPending}
              onClick={() => respond.mutate(false)}
            >
              <X aria-hidden /> {t.trials.declineInvitation}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (existingStatus) {
    return (
      <Alert
        tone={
          existingStatus === 'REJECTED' || existingStatus === 'FAILED'
            ? 'warning'
            : existingStatus === 'PASSED' || existingStatus === 'ACCEPTED'
              ? 'success'
              : 'info'
        }
        title={t.trials.applied}
      >
        {t.trials.applicationStatus}: <strong>{t.trials[STATUS_LABEL[existingStatus]]}</strong>
      </Alert>
    );
  }

  /*
   * Past the deadline and never applied. The trial stays readable — a player who
   * hears about it late should be able to see what they missed and who ran it —
   * but there is nothing to press.
   */
  if (closed) {
    return (
      <Alert tone="warning" title={t.trials.applicationsClosed}>
        {applyDeadline && f(t.trials.applicationsClosedOn, { date: formatDate(applyDeadline) })}
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {apply.isError && <Alert tone="danger">{(apply.error as Error).message}</Alert>}
      <Button size="lg" className="w-full" loading={apply.isPending} onClick={() => apply.mutate()}>
        {apply.isSuccess ? <Check aria-hidden /> : <Send aria-hidden />} {t.trials.apply}
      </Button>
      {ageRange && (
        <p className="text-muted text-center text-xs">
          {f(t.trials.ageCheckedAutomatically, { min: ageRange.min, max: ageRange.max })}
        </p>
      )}
      {applyDeadline && (
        <p className="text-muted text-center text-xs">
          {f(t.trials.applyBefore, { date: formatDate(applyDeadline) })}
        </p>
      )}
    </div>
  );
}

/** Application status → the dictionary key that names it. */
const STATUS_LABEL = {
  APPLIED: 'statusApplied',
  SCREENING: 'statusScreening',
  SHORTLISTED: 'statusShortlisted',
  INVITED: 'statusInvited',
  CONFIRMED: 'statusConfirmed',
  PASSED: 'statusPassed',
  FAILED: 'statusFailed',
  REJECTED: 'statusRejected',
  ACCEPTED: 'statusAccepted',
} as const satisfies Record<TrialApplicationStatus, string>;
