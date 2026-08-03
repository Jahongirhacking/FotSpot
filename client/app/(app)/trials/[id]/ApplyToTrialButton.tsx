'use client';

import Link from 'next/link';
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

/**
 * Only players apply. A non-player sees the route to becoming one instead of a
 * disabled button with no explanation — this is the just-in-time role prompt from
 * README §1.2.2, at the exact moment it carries its own motivation.
 */
export function ApplyToTrialButton({
  trialId,
  existingStatus,
  ageRange,
}: {
  trialId: string;
  existingStatus: TrialApplicationStatus | null;
  ageRange: { min: number; max: number };
}) {
  const { t } = useI18n();
  const { hasRole, isAuthenticated } = useSession();
  const requireAuth = useRequireAuth();

  const apply = useMutation({
    mutationFn: () => browserFetch(`/trials/${trialId}/apply`, { method: 'POST' }),
    onSuccess: () => window.location.reload(),
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

  if (existingStatus) {
    return (
      <Alert tone={existingStatus === 'REJECTED' ? 'warning' : 'success'} title={t.trials.applied}>
        Your application is <strong>{existingStatus.toLowerCase()}</strong>. You&apos;ll be notified
        when the academy updates it.
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {apply.isError && <Alert tone="danger">{(apply.error as Error).message}</Alert>}
      <Button size="lg" className="w-full" loading={apply.isPending} onClick={() => apply.mutate()}>
        {apply.isSuccess ? <Check aria-hidden /> : <Send aria-hidden />} Apply for this trial
      </Button>
      <p className="text-muted text-center text-xs">
        The academy checks your age against the {ageRange.min}–{ageRange.max} range automatically.
      </p>
    </div>
  );
}
