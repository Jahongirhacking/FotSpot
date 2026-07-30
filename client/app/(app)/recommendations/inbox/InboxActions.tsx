'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { RecommendationStatus } from '@/lib/api/types';
import { Button } from '@/components/ui/Button';

/**
 * Accept or reject every open recommendation backing one player.
 *
 * A player may be backed by several scouts, and the decision is about the *player* —
 * so all of their open recommendations resolve together. Accepting one and leaving
 * the rest pending would mean the other scouts never learn the outcome, and their
 * success rate would stay wrong.
 */
export function InboxActions({ recommendationIds }: { recommendationIds: string[] }) {
  const router = useRouter();

  const decide = useMutation({
    mutationFn: async (status: RecommendationStatus) => {
      // Sequential, not parallel: each acceptance recomputes the scout's reputation
      // server-side, and a burst of concurrent writes to the same stats rows is
      // needless contention.
      for (const id of recommendationIds) {
        await browserFetch(`/recommendations/${id}/status`, {
          method: 'PATCH',
          body: { status },
        });
      }
    },
    onSuccess: () => router.refresh(),
  });

  return (
    <div className="flex shrink-0 gap-1">
      <Button
        size="icon"
        variant="ghost"
        aria-label="Accept"
        title="Accept"
        loading={decide.isPending}
        onClick={() => decide.mutate('ACCEPTED')}
      >
        <Check className="text-success" aria-hidden />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Reject"
        title="Reject"
        disabled={decide.isPending}
        onClick={() => decide.mutate('REJECTED')}
      >
        <X className="text-danger" aria-hidden />
      </Button>
    </div>
  );
}
