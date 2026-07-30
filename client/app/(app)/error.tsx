'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';

/**
 * Error boundary for the authenticated shell (client/CLAUDE.md §7 — every segment
 * that fetches data gets its own, not one global boundary).
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-12">
      <Alert tone="danger" title="Something went wrong">
        We couldn&apos;t load this page. This is usually temporary.
      </Alert>
      <Button onClick={reset} className="w-full">
        <RotateCcw aria-hidden /> Try again
      </Button>
    </div>
  );
}
