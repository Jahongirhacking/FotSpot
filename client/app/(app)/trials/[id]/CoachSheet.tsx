'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { ParticipantList } from '@/components/trials/ParticipantList';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useStagePages } from '@/components/trials/useStagePages';
import type { Trial, TrialApplication } from '@/lib/api/types';
import { Users } from 'lucide-react';

/**
 * The coach's sheet on a trial's own page: the participants, and where the
 * verdict is written. The list itself is `ParticipantList`, shared with the
 * drawer the dashboard opens — this is only the card around it and its
 * count, read from the same query the list fills.
 *
 * Only PASS and FAIL live here (TRIAL.md Rule 7), and they belong to a coach
 * assigned to the trial on a global and a private one alike (§10). Nothing
 * here places a player anywhere: a pass makes them *eligible* for a squad,
 * and the manager decides whether to take them (Rule 9).
 */
export function CoachSheet({ trial }: { trial: Trial }) {
  const { t } = useI18n();

  // The same query the list opens on; only the count is wanted here.
  const count = useStagePages<TrialApplication>({
    list: 'trial-applications',
    id: trial?.id,
    path: `/trials/${trial?.id}/applications`,
    stage: null,
  }).total;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="text-primary size-4" aria-hidden /> {t.trials.participants}
          {count > 0 && <Badge variant="neutral">{count}</Badge>}
        </CardTitle>
        <p className="text-muted text-sm">{t.trials.sheetHint}</p>
      </CardHeader>

      <CardContent className="p-3">
        <ParticipantList trial={trial} />
      </CardContent>
    </Card>
  );
}
