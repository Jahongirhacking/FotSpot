import type { PlayerProfile } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n';
import { PitchMap, DominantFootFigure } from '@/components/player/PitchMap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { humanizeEnum } from '@/lib/utils';

/**
 * Position and dominant foot, as pictures.
 *
 * Laid out beside the player card, so it is sized to sit at the same height
 * rather than towering over it — the pitch is capped at 150px and the foot figure
 * sits next to it, not underneath. A pitch drawn as large as it can be reads as
 * the most important thing on the page, which it is not; it is a legend for one
 * field on the card.
 */
export function OnThePitchCard({
  player,
  t,
  className,
}: {
  player: PlayerProfile;
  t: Dictionary;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t.player.onThePitch}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-around gap-4 pt-1">
        <div className="w-[132px] shrink-0">
          <PitchMap primary={player.primaryPosition} secondary={player.secondaryPosition} />
        </div>

        <div className="flex flex-col items-center gap-2">
          <p className="text-muted text-[10px] tracking-wide uppercase">{t.player.dominantFoot}</p>
          <DominantFootFigure foot={player.dominantFoot} />
          {player.playingStyle && (
            <Badge variant="accent">{humanizeEnum(player.playingStyle)}</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
