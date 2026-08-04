'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { useI18n } from '@/components/layout/I18nProvider';

/**
 * Error boundary for the authenticated shell (client/CLAUDE.md §7 — every segment
 * that fetches data gets its own, not one global boundary).
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-md space-y-4 py-12">
      <Alert tone="danger" title={t.common.somethingWrong}>
        {t.common.couldNotLoad}
      </Alert>
      <Button onClick={reset} className="w-full">
        <RotateCcw aria-hidden /> {t.common.tryAgain}
      </Button>
    </div>
  );
}
