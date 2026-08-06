'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { CalendarDays, MapPin, Plus, Users } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Trial } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { formatDate } from '@/lib/utils';

/**
 * The manager's half of the trials screen: what their academy has scheduled, and
 * the form to add one.
 *
 * It sits above the public list rather than on a page of its own — a manager
 * opening "Trials" wants their own first and everyone else's second, and two
 * routes would make them choose before they had seen either.
 */
export function AcademyTrials({
  academyId,
  academyName,
  initial,
}: {
  academyId: string;
  academyName: string;
  initial: Trial[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [trials, setTrials] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      browserFetch<Trial>(`/trials/academy/${academyId}`, { method: 'POST', body }),
    onSuccess: (trial) => {
      setTrials((current) => [trial, ...current]);
      setOpen(false);
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    create.mutate({
      title: String(form.get('title') ?? '').trim(),
      location: String(form.get('location') ?? '').trim(),
      date: new Date(String(form.get('date'))).toISOString(),
      ageRangeMin: Number(form.get('ageMin')),
      ageRangeMax: Number(form.get('ageMax')),
      // Comma-separated, because a manager listing "GK, CB, LB" should not have
      // to meet a multi-select first.
      positions: String(form.get('positions') ?? '')
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
      requirements: String(form.get('requirements') ?? '').trim() || undefined,
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="text-base">{t.academy.myTrials}</CardTitle>
          <p className="text-muted truncate text-sm">{academyName}</p>
        </div>
        <Button size="sm" onClick={() => setOpen((was) => !was)}>
          <Plus aria-hidden /> {t.academy.createTrial}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        {open && (
          <form onSubmit={submit} className="border-border space-y-3 rounded-lg border p-3">
            <Field label={t.trials.title} htmlFor="trial-title" required>
              <Input
                id="trial-title"
                name="title"
                required
                placeholder={t.placeholders.trialTitle}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.trials.location} htmlFor="trial-location" required>
                <Input
                  id="trial-location"
                  name="location"
                  required
                  placeholder={t.placeholders.district}
                />
              </Field>
              <Field label={t.trials.date} htmlFor="trial-date" required>
                <Input id="trial-date" name="date" type="datetime-local" required />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t.trials.ageMin} htmlFor="trial-age-min" required>
                <Input
                  id="trial-age-min"
                  name="ageMin"
                  type="number"
                  min={6}
                  max={21}
                  defaultValue={12}
                  required
                />
              </Field>
              <Field label={t.trials.ageMax} htmlFor="trial-age-max" required>
                <Input
                  id="trial-age-max"
                  name="ageMax"
                  type="number"
                  min={6}
                  max={21}
                  defaultValue={14}
                  required
                />
              </Field>
            </div>

            <Field
              label={t.trials.positions}
              htmlFor="trial-positions"
              hint={t.trials.positionsHint}
            >
              <Input id="trial-positions" name="positions" placeholder={t.placeholders.positions} />
            </Field>

            <Field label={t.trials.requirements} htmlFor="trial-req">
              <Textarea id="trial-req" name="requirements" placeholder={t.placeholders.note} />
            </Field>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" loading={create.isPending}>
                {t.academy.createTrial}
              </Button>
            </div>
          </form>
        )}

        {trials.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={t.trials.noTrials}
            description={t.trials.noTrialsHint}
          />
        ) : (
          <ul className="divide-border divide-y">
            {trials.map((trial) => (
              <li key={trial.id}>
                <Link
                  href={`/trials/${trial.id}`}
                  className="hover:bg-surface-2 flex flex-wrap items-center gap-3 rounded-lg p-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{trial.title}</span>
                      {trial.status === 'ARCHIVED' && (
                        <Badge variant="neutral">{t.trials.statusArchived}</Badge>
                      )}
                    </span>
                    <span className="text-muted flex flex-wrap items-center gap-2 text-xs">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="size-3" aria-hidden /> {formatDate(trial.date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" aria-hidden /> {trial.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3" aria-hidden /> U{trial.ageRangeMax}
                      </span>
                    </span>
                  </span>
                  <Badge variant="primary" className="shrink-0">
                    {new Date(trial.date) > new Date() ? t.trials.open : t.trials.closed}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
