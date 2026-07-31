import type { PlayerProfile } from '@/lib/api/types';
import { PlayerCard } from '@/components/player/PlayerCard';

/**
 * Search result — the small card variant.
 *
 * Carries the age band, never a birth date: a search result is the wrong place to
 * expose a child's exact date of birth (README §11.3), and the card only ever
 * renders the band.
 *
 * No assessments are passed. Fetching every result's coach assessments would be a
 * query per row, so the stars read "unrated" here; the profile page shows the real
 * evidence tier.
 */
export function PlayerResultCard({ player }: { player: PlayerProfile }) {
  return <PlayerCard player={player} size="sm" href={`/players/${player.id}`} />;
}
