'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Check, Send } from 'lucide-react';
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
  ageRange,
  applyDeadline,
}: {
  trialId: string;
  existingStatus: TrialApplicationStatus | null;
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
