import { PitchBackdrop } from '@/components/shared/FootballArt';
import { LoadingImage } from '@/components/ui/LoadingImage';
import { cn } from '@/lib/utils';

/**
 * A trial's cover, at the size a list row can carry.
 *
 * `TrialCard` shows the same picture full-bleed above a card on the public
 * board; the lists — an academy's own trials, the open trials on its profile —
 * were text with a chevron. A trial is a real session at a real place, and the
 * photograph is the fastest thing to recognise it by, so the rows get it too at
 * a size that does not turn a list into a gallery.
 *
 * ## The fallback is a pitch, not a grey box
 *
 * Most trials have no cover, so the fallback is the common case rather than the
 * exception — and it has to hold the row's shape without pretending to be a
 * photograph of anywhere in particular. The same `PitchBackdrop` the card uses,
 * so the two never disagree about what a trial with no picture looks like.
 */
export function TrialThumb({
  coverUrl,
  className,
}: {
  coverUrl?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-surface-2 relative aspect-video w-16 shrink-0 overflow-hidden rounded-md sm:w-20',
        className,
      )}
    >
      {coverUrl ? (
        <LoadingImage
          src={coverUrl}
          // Decorative: the trial's title sits beside it in text, so a screen
          // reader announcing the picture would only repeat the link.
          alt=""
          loading="lazy"
          spinner={false}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <PitchBackdrop className="text-primary/20" />
      )}
    </div>
  );
}
