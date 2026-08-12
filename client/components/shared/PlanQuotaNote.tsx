'use client';

import { useQuery } from '@tanstack/react-query';
import { browserFetch } from '@/lib/api/browser';
import type { MyPlanUsage } from '@/lib/api/resources';
import { useI18n } from '@/components/layout/I18nProvider';
import { Alert } from '@/components/ui/Feedback';

/** Which of the caller's quotas this note is about. */
export type QuotaKind = 'coaches' | 'groups' | 'recommendations';

/**
 * "You can add 2 more coaches", beside the button that adds one.
 *
 * A limit the user only meets at the moment of refusal reads as a bug; the same
 * limit shown before they start reads as a plan. Both come from the same
 * `/tariff-plans/me` read the backend enforces against, so the sentence and the
 * refusal cannot disagree.
 *
 * Renders nothing while loading, and nothing for a caller with no such quota —
 * an empty space is the right answer for "this limit does not apply to you", and
 * a skeleton here would be chrome announcing a number nobody asked about.
 */
export function PlanQuotaNote({ kind }: { kind: QuotaKind }) {
  const { t, f } = useI18n();

  const { data } = useQuery({
    queryKey: ['my-plan'],
    queryFn: () => browserFetch<MyPlanUsage>('/tariff-plans/me'),
    staleTime: 60 * 1000,
  });

  const quota = data?.[kind];
  if (!quota) return null;

  const copy = MESSAGES[kind];

  if (quota?.exceeded) {
    return (
      <Alert tone="warning" title={t.plans.limitReached}>
        {t.plans[copy.none]}
      </Alert>
    );
  }

  return (
    <p className="text-muted text-xs">{f(t.plans[copy.left], { count: quota?.remaining })}</p>
  );
}

/** Dictionary keys per quota, so the copy stays in the dictionaries. */
const MESSAGES = {
  coaches: { left: 'coachesLeft', none: 'coachesNone' },
  groups: { left: 'groupsLeft', none: 'groupsNone' },
  recommendations: { left: 'recommendationsLeft', none: 'recommendationsNone' },
} as const;
