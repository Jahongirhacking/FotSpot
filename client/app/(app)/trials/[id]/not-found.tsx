import { CalendarDays } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { getServerT } from '@/lib/i18n/server';

/**
 * A trial that is not there — or that this reader may not know exists.
 *
 * `getVisibleById` answers 404 rather than 403 for a private trial the reader is
 * not part of, deliberately: "forbidden" on a session about one named child
 * still tells you that child is being looked at. So this page cannot distinguish
 * gone from not-yours, and says the one thing true of both.
 *
 * Its own boundary rather than the shell's, so the way out is the trials board
 * rather than a generic retry that will 404 again (client/CLAUDE.md §7).
 */
export default async function TrialNotFound() {
  const { t } = await getServerT();

  return (
    <EmptyState
      icon={CalendarDays}
      title={t.trials.trialNotFound}
      description={t.trials.trialNotFoundHint}
      action={
        <Button asChild variant="outline">
          <Link href="/trials">{t.trials.backToTrials}</Link>
        </Button>
      }
    />
  );
}
