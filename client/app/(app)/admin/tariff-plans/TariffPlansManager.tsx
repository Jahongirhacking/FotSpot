'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { TariffPlan } from '@/lib/api/resources';
import { planLabel } from '@/lib/plans';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';

/** The five editable numbers, in the order they are explained to the admin. */
const LIMITS = [
  { key: 'clipLimit', label: 'clipLimit', hint: 'clipLimitHint', min: 0 },
  { key: 'clipWindowDays', label: 'clipWindowDays', hint: 'clipWindowDaysHint', min: 1 },
  {
    key: 'pendingRecommendationLimit',
    label: 'pendingRecommendationLimit',
    hint: 'pendingRecommendationLimitHint',
    min: 0,
  },
  { key: 'maxCoaches', label: 'maxCoaches', hint: 'maxCoachesHint', min: 0 },
  { key: 'maxGroups', label: 'maxGroups', hint: 'maxGroupsHint', min: 0 },
] as const;

type LimitKey = (typeof LIMITS)[number]['key'];

/**
 * One editable card per tier.
 *
 * Each card saves on its own and sends only the fields that changed, so two
 * admins editing different tiers — or the same tier a minute apart — cannot
 * overwrite each other with values their form happened to be holding.
 */
export function TariffPlansManager({ initial }: { initial: TariffPlan[] }) {
  const { data: plans } = useQuery({
    queryKey: ['tariff-plans'],
    queryFn: () => browserFetch<TariffPlan[]>('/tariff-plans'),
    initialData: initial,
  });

  /*
   * Which tier last saved, held here rather than inside the card.
   *
   * A successful save changes `updatedAt`, which remounts the card (see the key
   * below) — so a "Saved" flag living in the card would be destroyed by the very
   * event it exists to announce.
   */
  const [savedTier, setSavedTier] = React.useState<TariffPlan['tier'] | null>(null);

  if (!plans?.length) {
    return <Alert tone="danger">No tariff plans are configured. Run the database seed.</Alert>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {plans?.map((plan) => (
        // Keyed on the row's own timestamp, so a saved (or somebody else's)
        // change remounts the card and the inputs re-read the server rather
        // than an effect syncing them one render late.
        <PlanCard
          key={`${plan?.tier}:${plan?.updatedAt}`}
          plan={plan}
          saved={savedTier === plan?.tier}
          onSaved={() => setSavedTier(plan?.tier)}
          onEdited={() => setSavedTier(null)}
        />
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  saved,
  onSaved,
  onEdited,
}: {
  plan: TariffPlan;
  saved: boolean;
  onSaved: () => void;
  onEdited: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<Record<LimitKey, string>>(() => toDraft(plan));
  const [error, setError] = React.useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: Partial<Record<LimitKey, number>>) =>
      browserFetch<TariffPlan>(`/tariff-plans/${plan?.tier}`, { method: 'PATCH', body }),
    onSuccess: () => {
      setError(null);
      onSaved();
      queryClient.invalidateQueries({ queryKey: ['tariff-plans'] });
    },
    onError: (err: Error) => {
      onEdited();
      setError(err.message);
    },
  });

  /** Only what actually moved — see the class note on partial saves. */
  const changed = React.useMemo(() => {
    const body: Partial<Record<LimitKey, number>> = {};
    for (const limit of LIMITS) {
      const next = Number(draft[limit.key]);
      if (draft[limit.key] !== '' && Number.isFinite(next) && next !== plan[limit.key]) {
        body[limit.key] = next;
      }
    }
    return body;
  }, [draft, plan]);

  const dirty = Object.keys(changed).length > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>{planLabel(plan?.tier, t)}</CardTitle>
        <Badge variant={plan?.tier === 'FREE' ? 'neutral' : 'primary'}>{plan?.tier}</Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        {LIMITS.map((limit) => (
          <Field
            key={limit.key}
            label={t.plans[limit.label]}
            hint={t.plans[limit.hint]}
            htmlFor={`${plan?.tier}-${limit.key}`}
          >
            <Input
              id={`${plan?.tier}-${limit.key}`}
              type="number"
              inputMode="numeric"
              min={limit.min}
              max={limit.key === 'clipWindowDays' ? 365 : 10000}
              value={draft[limit.key]}
              onChange={(event) => {
                onEdited();
                setDraft((current) => ({ ...current, [limit.key]: event.target.value }));
              }}
            />
          </Field>
        ))}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!dirty}
            loading={save.isPending}
            onClick={() => save.mutate(changed)}
          >
            {t.plans.save}
          </Button>
          {saved && !dirty && (
            <span className="text-success flex items-center gap-1 text-xs">
              <Check className="size-3.5" aria-hidden /> {t.plans.saved}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function toDraft(plan: TariffPlan): Record<LimitKey, string> {
  return {
    clipLimit: String(plan?.clipLimit),
    clipWindowDays: String(plan?.clipWindowDays),
    pendingRecommendationLimit: String(plan?.pendingRecommendationLimit),
    maxCoaches: String(plan?.maxCoaches),
    maxGroups: String(plan?.maxGroups),
  };
}
