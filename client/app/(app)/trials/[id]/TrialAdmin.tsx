'use client';

import Link from 'next/link';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil, Settings2 } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Trial } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { TrialStaff } from './TrialStaff';

/**
 * The host's controls on a published trial — one compact panel.
 *
 * ## One panel, not two cards
 *
 * Editing, archiving and staffing are the three things a manager does *to* a
 * trial, and they used to sit in two cards: a tall one whose whole body was a
 * sentence, with two small ghost buttons in its corner, and a second one for
 * the coaches. This is the same three controls in one place: a status line
 * with the two buttons beside it, and the coaches under a divider.
 *
 * ## Editing, because a trial is a plan and plans move
 *
 * A pitch that falls through the week before is the ordinary case, not the
 * exception. Editing happens on the trials screen, in the same form that
 * creates one — a link rather than a panel here, so the two forms cannot
 * drift apart.
 *
 * ## Archive, because there is no delete
 *
 * Every application on a trial is a decision somebody made about a child, and
 * a row that vanishes takes that record with it. Archiving stops new
 * applications and takes the trial off the public list; the applicants stay,
 * and the trial can be reopened if it was closed by mistake. That
 * reversibility is why this button confirms once rather than making somebody
 * type the title.
 */
export function TrialAdmin({ trial }: { trial: Trial }) {
  const { t } = useI18n();
  const router = useRouter();

  const archived = trial?.status === 'ARCHIVED';

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      browserFetch<Trial>(`/trials/${trial?.id}`, { method: 'PATCH', body }),
    meta: { success: t.trials.trialUpdated },
    onSuccess: () => router.refresh(),
  });

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="text-primary size-4" aria-hidden />
            {t.trials.manageTrial}
            <Badge variant={archived ? 'neutral' : 'success'}>
              {archived ? t.trials.statusArchived : t.trials.open}
            </Badge>
          </CardTitle>
          {/* Said here rather than only on the badge: the manager who archived
              it needs to know applications have stopped, not just that a label
              changed. */}
          <p className="text-muted mt-1 text-xs">
            {archived ? t.trials.archivedHint : t.trials.openHint}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/trials?edit=${trial?.id}`}>
              <Pencil aria-hidden /> {t.common.edit}
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
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

      <CardContent className="border-border border-t pt-3">
        <TrialStaff trial={trial} academyId={trial?.academyId} embedded />
      </CardContent>
    </Card>
  );
}
