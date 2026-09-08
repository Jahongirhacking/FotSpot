'use client';

import { ClipboardList } from 'lucide-react';
import type { Trial } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { ManagerApplicantList, useTrialApplicants } from '@/components/trials/ManagerApplicantList';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

/**
 * The manager's applicant list on the trial's own page — the same list the
 * trials screen opens in a drawer (`ManagerTrialDrawer`), in a card with the
 * count on it. See `ManagerApplicantList` for what the list does.
 */
export function Applicants({ trial }: { trial: Trial }) {
  const { t } = useI18n();
  // The same query the list opens on; only the counts are wanted here.
  const { counts } = useTrialApplicants(trial?.id, 'PENDING');
  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="text-primary size-4" aria-hidden /> {t.academy.applicants}
          {total > 0 && <Badge variant="neutral">{total}</Badge>}
        </CardTitle>
        <p className="text-muted text-sm">{t.academy.applicantsHint}</p>
      </CardHeader>

      <CardContent className="p-3">
        <ManagerApplicantList trial={trial} />
      </CardContent>
    </Card>
  );
}
