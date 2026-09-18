import type { DominantFoot, ProfessionalPlayer } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n';

export function fullName(player: Pick<ProfessionalPlayer, 'firstName' | 'lastName'>): string {
  return [player.firstName, player.lastName].filter(Boolean).join(' ');
}

/** The reader's word for a foot, or nothing when the record does not say. */
export function footLabel(foot: DominantFoot | null | undefined, t: Dictionary): string | null {
  if (foot === 'LEFT') return t.player.footLeft;
  if (foot === 'RIGHT') return t.player.footRight;
  if (foot === 'BOTH') return t.player.footBoth;
  return null;
}

/** Where an academy's own page is: the handle when it has one, the id otherwise. */
export function academyHref(academy: { id: string; username: string | null }): string {
  return academy.username ? `/academies/@${academy.username}` : `/academies/${academy.id}`;
}
