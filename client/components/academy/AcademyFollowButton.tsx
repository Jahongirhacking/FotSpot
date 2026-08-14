'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { browserFetch } from '@/lib/api/browser';

/** One key for the whole feature, so the button and any list of follows agree. */
const followKey = (academyId: string) => ['follows', 'academy', academyId] as const;

interface FollowStatus {
  following: boolean;
}

/**
 * "Follow for trials" — a player asking this academy to tell them when it holds
 * one they fit.
 *
 * ## It is a subscription, not a social graph
 *
 * The row it writes is what `TrialsService.announceToMatchingPlayers` reads: a
 * published trial notifies the followers whose position and age match it, and
 * nobody else. So the wording says trials rather than "Follow", because what the
 * player is agreeing to is messages — and a button that undersells that is how
 * somebody ends up muting the app instead of this academy.
 *
 * Nothing else in the product changes as a result. There is no academy feed to
 * appear in and no follower count on show here; this exists to make one
 * notification arrive.
 *
 * ## Optimistic, because the answer is already known
 *
 * The press flips a boolean the client can compute itself, and a spinner between
 * "Follow" and "Following" makes a decision feel like a transaction. The cache
 * is written first and rolled back if the request fails, so a dropped connection
 * ends with the button telling the truth rather than a lie that survives until
 * the next reload.
 */
export function AcademyFollowButton({
  academyId,
  isAuthenticated,
  loginHref,
  className,
}: {
  academyId: string;
  isAuthenticated: boolean;
  /** Where a guest goes to become somebody who can follow. */
  loginHref: string;
  className?: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState(false);

  const { data } = useQuery({
    queryKey: followKey(academyId),
    queryFn: () => browserFetch<FollowStatus>(`/follows/status/ACADEMY/${academyId}`),
    // A guest has no follows to read, and asking would be a guaranteed 401.
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });

  const following = data?.following ?? false;

  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      browserFetch('/follows', {
        method: next ? 'POST' : 'DELETE',
        body: { targetType: 'ACADEMY', targetId: academyId },
      }),
    onMutate: async (next: boolean) => {
      setError(false);
      // Stop an in-flight read from landing after the optimistic write and
      // reinstating the state the player just changed.
      await queryClient.cancelQueries({ queryKey: followKey(academyId) });
      const previous = queryClient.getQueryData<FollowStatus>(followKey(academyId));
      queryClient.setQueryData<FollowStatus>(followKey(academyId), { following: next });
      return { previous };
    },
    onError: (_err, _next, context) => {
      // Put back exactly what was there, including "not asked yet".
      queryClient.setQueryData(followKey(academyId), context?.previous);
      setError(true);
    },
    // Settled rather than success: after either outcome the server is the
    // authority, and one refetch reconciles both.
    onSettled: () => queryClient.invalidateQueries({ queryKey: followKey(academyId) }),
  });

  if (!isAuthenticated) {
    return (
      <Button asChild variant="outline" className={className}>
        <Link href={loginHref}>
          <Bell aria-hidden /> {t.academy?.followForTrials}
        </Link>
      </Button>
    );
  }

  return (
    <div className={className}>
      <Button
        variant={following ? 'outline' : 'primary'}
        aria-pressed={following}
        onClick={() => toggle.mutate(!following)}
      >
        {following ? <BellRing aria-hidden /> : <Bell aria-hidden />}
        {following ? t.academy?.followingForTrials : t.academy?.followForTrials}
      </Button>

      <p className="text-muted mt-1.5 max-w-[26ch] text-xs leading-snug">
        {error ? t.common?.somethingWrong : t.academy?.followForTrialsHint}
      </p>
    </div>
  );
}
