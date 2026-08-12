import type { PlayerProfile } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n';
import { PitchMap, DominantFootFigure } from '@/components/player/PitchMap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PLAYING_STYLE_INFO, exemplarInitials } from '@/lib/playing-styles';
import { cn, humanizeEnum } from '@/lib/utils';

/**
 * Position, dominant foot and playing style, as pictures.
 *
 * Laid out beside the player card, so it is sized to sit at the same height
 * rather than towering over it — the pitch is capped and the foot figure sits
 * next to it, not underneath. A pitch drawn as large as it can be reads as the
 * most important thing on the page, which it is not; it is a legend for one
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
      <CardContent className="space-y-3 pt-1">
        <div className="flex flex-wrap items-center justify-around gap-4">
          <div className="w-[132px] shrink-0">
            <PitchMap primary={player?.primaryPosition} secondary={player?.secondaryPosition} />
          </div>

          <div className="flex flex-col items-center gap-2">
            <p className="text-muted text-[10px] tracking-wide uppercase">
              {t.player.dominantFoot}
            </p>
            <DominantFootFigure foot={player?.dominantFoot} />
          </div>
        </div>

        {player?.playingStyle && <PlayingStyleStrip style={player?.playingStyle} t={t} />}
      </CardContent>
    </Card>
  );
}

/**
 * The style, said properly rather than as a bare badge.
 *
 * A badge reading "Box To Box" is the enum with the underscores taken out — it
 * names the answer without explaining it, which is no use to the parent reading
 * the card or to the player who picked it from a list weeks ago. The same three
 * pieces the picker uses (crest, name, one line) read here in a compact row, so
 * choosing a style and seeing it afterwards are recognisably the same thing.
 *
 * Compact on purpose: this card is a legend beside the player card, and the
 * description is one clamped line rather than a paragraph that would make the
 * legend taller than the thing it explains.
 */
function PlayingStyleStrip({ style, t }: { style: string; t: Dictionary }) {
  const info = PLAYING_STYLE_INFO?.[style];
  const description = info?.key ? t.playingStyles?.[info?.key] : undefined;

  return (
    <div className="border-border bg-surface-2 flex items-center gap-3 rounded-lg border p-2.5">
      <StyleCrest name={info?.exemplar ?? ''} imageUrl={info?.imageUrl} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{humanizeEnum(style)}</p>
        {description && (
          <p className="text-muted mt-0.5 line-clamp-2 text-xs leading-snug">{description}</p>
        )}
        {info?.exemplar && (
          <p className="text-muted mt-0.5 truncate text-[11px] italic">
            {t.onboarding?.styleLikeWho}: {info?.exemplar}
          </p>
        )}
      </div>
    </div>
  );
}

/** The exemplar image when the bucket has one, initials when it does not. */
function StyleCrest({ name, imageUrl }: { name: string; imageUrl?: string }) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- bucket asset; next/image would add a loader for no gain
      <img
        src={imageUrl}
        alt={name}
        loading="lazy"
        className="size-12 shrink-0 rounded-lg object-contain"
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'bg-surface-3 text-muted grid size-12 shrink-0 place-items-center rounded-lg',
        'text-xs font-black',
      )}
    >
      {exemplarInitials(name)}
    </span>
  );
}
