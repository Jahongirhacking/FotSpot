'use client';

import * as React from 'react';
import Link from 'next/link';
import { Volleyball, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

/**
 * The fallback for a skipped welcome (README §1.2.2) — the question returns as a
 * dismissible card rather than vanishing. Dismissal is local to the render; the
 * account-level flag is only set by actually answering, so it will resurface next
 * visit if still unanswered. That is deliberate: this is the single most valuable
 * question the product asks.
 */
export function RoleIntentCard() {
  const [dismissed, setDismissed] = React.useState(false);
  if (dismissed) return null;

  return (
    <Card className="border-primary/30 relative overflow-hidden">
      <div className="pitch-gradient flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-xl">
          <Volleyball className="size-5" aria-hidden />
        </div>
        <div className="flex-1">
          <p className="font-semibold">Do you play football yourself?</p>
          <p className="text-muted mt-0.5 text-sm">
            Set up a player card so academies can find you. Takes about a minute.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/onboarding/player">Set up my card</Link>
        </Button>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-muted hover:bg-surface-2 absolute top-2 right-2 grid size-8 place-items-center rounded-lg"
      >
        <X className="size-4" aria-hidden />
      </button>
    </Card>
  );
}
