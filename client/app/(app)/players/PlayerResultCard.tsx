import Link from 'next/link';
import { MapPin } from 'lucide-react';
import type { PlayerProfile } from '@/lib/api/types';
import { ageBand, humanizeEnum, initials } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

/**
 * Compact search result. Shows the age band, never a birth date — a search result
 * is the wrong place to expose a child's exact date of birth (README §11.3).
 */
export function PlayerResultCard({ player }: { player: PlayerProfile }) {
  return (
    <Card className="hover:border-primary/40 h-full transition-colors">
      <Link href={`/players/${player.id}`} className="block p-4">
        <div className="flex items-start gap-3">
          <span
            className="bg-primary/15 text-primary grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold"
            aria-hidden
          >
            {initials(player.firstName, player.lastName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {player.firstName} {player.lastName}
            </p>
            <p className="text-muted mt-0.5 flex items-center gap-1 text-xs">
              <MapPin className="size-3" aria-hidden />
              {player.region ?? 'Uzbekistan'}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {ageBand(player.birthDate)}
          </Badge>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {player.primaryPosition && (
            <Badge variant="primary" className="font-mono">
              {player.primaryPosition}
            </Badge>
          )}
          {player.playingStyle && (
            <Badge variant="accent">{humanizeEnum(player.playingStyle)}</Badge>
          )}
          {player.dominantFoot && (
            <Badge variant="neutral">{humanizeEnum(player.dominantFoot)} foot</Badge>
          )}
        </div>
      </Link>
    </Card>
  );
}
