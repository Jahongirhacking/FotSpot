'use client';

import { GlobalTrialsSection, PrivateTrialsSection } from '@/components/trials/CoachQueues';
import type { CoachTrial } from '@/lib/api/types';

/**
 * The coach's trials screen — the same two lists as their dashboard, plus the
 * sessions already archived.
 *
 * Private trials are the players, judged from the row; global trials are the
 * sessions, opened to judge the group. See `CoachQueues` for why the two are
 * shaped differently. One component for both screens, so a coach reads one
 * layout wherever they look.
 */
export function CoachTrials({ initialTrials }: { initialTrials: CoachTrial[] }) {
  return (
    <div className="space-y-6">
      <PrivateTrialsSection />
      <GlobalTrialsSection initialTrials={initialTrials} showSettled />
    </div>
  );
}
