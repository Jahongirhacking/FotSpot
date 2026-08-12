'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { SuggestedPlayer } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ageBand, initials } from '@/lib/utils';

/**
 * Who to follow, beside the feed.
 *
 * Following a suggestion is what tunes the feed — a followed player's clips carry
 * extra weight in the ranking — so the two panels are one loop, not a sidebar
 * decoration.
 *
 * A followed row stays in place, marked, rather than vanishing. A list that
 * reshuffles under the finger costs the reader the row they were aiming at, and
 * the next load drops it anyway.
 */
export function SuggestedPlayers({ initial }: { initial: SuggestedPlayer[] }) {
  const { t } = useI18n();
  const [followed, setFollowed] = React.useState<Record<string, boolean>>({});

  const follow = useMutation({
    mutationFn: (playerId: string) =>
      browserFetch('/follows', {
        method: 'POST',
        body: { targetType: 'PLAYER', targetId: playerId },
      }),
    onError: (_error, playerId) => setFollowed((current) => ({ ...current, [playerId]: false })),
  });

  if (initial.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t.feed.suggested}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 p-2">
        {initial.map((player) => (
          <div key={player?.id} className="flex items-center gap-2 rounded-lg p-2">
            <Link
              href={`/players/${player?.id}`}
              className="flex min-w-0 flex-1 items-center gap-2.5"
            >
              <Avatar
                src={player?.avatarUrl}
                fallback={initials(player?.firstName, player?.lastName)}
                className="size-9"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {player?.firstName} {player?.lastName}
                </span>
                <span className="text-muted block truncate text-xs">
                  {[player?.primaryPosition, ageBand(player?.birthDate), player?.region]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </Link>

            {followed[player?.id] ? (
              <span className="text-muted shrink-0 text-xs">{t.feed.following}</span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="text-primary shrink-0"
                disabled={follow.isPending}
                onClick={() => {
                  setFollowed((current) => ({ ...current, [player?.id]: true }));
                  follow.mutate(player?.id);
                }}
              >
                <UserPlus aria-hidden /> {t.feed.follow}
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
