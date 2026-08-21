'use client';

import Link from 'next/link';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Trial } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';

/**
 * The host's controls on a published trial.
 *
 * ## Editing, because a trial is a plan and plans move
 *
 * A pitch that falls through the week before is the ordinary case, not the
 * exception. Without an edit the only recourse was a second trial, which left
 * the first one quietly collecting applications for a session nobody would run —
 * and split the applicants across two records.
 *
 * ## Archive, because there is no delete
 *
 * Every application on a trial is a decision somebody made about a child, and a
 * row that vanishes takes that record with it. Archiving stops new applications
 * and takes the trial off the public list; the applicants stay, and the trial can
 * be reopened if it was closed by mistake. That reversibility is why this button
 * confirms once rather than making somebody type the title.
 */
export function TrialAdmin({ trial }: { trial: Trial }) {
  const { t } = useI18n();
  const router = useRouter();

  const archived = trial?.status === 'ARCHIVED';

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      browserFetch<Trial>(`/trials/${trial?.id}`, { method: 'PATCH', body }),
    meta: { success: t.trials.trialUpdated },
    // Only archive/reopen reaches this now; editing lives on /trials.
    onSuccess: () => router.refresh(),
  });

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">{t.trials.manageTrial}</CardTitle>
        <div className="flex flex-wrap gap-2">
          {/* Editing happens on the trials screen, in the same form that creates
              one — see `TrialForm`. A link rather than a panel here, so the edit
              state lives in the URL and the two forms cannot drift apart again. */}
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/trials?edit=${trial?.id}`}>
              <Pencil aria-hidden /> {t.common.edit}
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={archived ? undefined : 'text-danger'}
            loading={save.isPending && save.variables?.status !== undefined}
            onClick={() => {
              const message = archived ? t.trials.confirmReopen : t.trials.confirmArchive;
              if (window.confirm(message)) {
                save.mutate({ status: archived ? 'OPEN' : 'ARCHIVED' });
              }
            }}
          >
            {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            {archived ? t.trials.reopen : t.trials.archive}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Said here rather than only on the badge: the manager who archived it
            needs to know applications have stopped, not just that a label changed. */}
        <Alert tone={archived ? 'warning' : 'info'}>
          {archived ? t.trials.archivedHint : t.trials.openHint}
        </Alert>
      </CardContent>
    </Card>
  );
}
