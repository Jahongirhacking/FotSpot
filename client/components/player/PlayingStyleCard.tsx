'use client';

import Link from 'next/link';
import { PLAYING_STYLE_INFO, exemplarInitials } from '@/lib/playing-styles';
import { useI18n } from '@/components/layout/I18nProvider';
import { cn, humanizeEnum } from '@/lib/utils';

/**
 * One playing style, as a card.
 *
 * ## `clickable` exists to stop the modal opening itself
 *
 * The same card is shown on `/playing-styles`, where pressing it opens the
 * modal, and *inside* that modal, where pressing it must do nothing. A clickable
 * copy in the modal would re-set `showPlayingStyle` on every press — at best a
 * no-op that looks broken, at worst a way to swap the style out from under the
 * description beside it.
 *
 * So the prop changes the element, not just a handler: linked it is an `<a>` the
 * keyboard reaches and the browser can open in a new tab; unlinked it is a
 * `<div>` with nothing to focus. Leaving a focusable element that ignores its own
 * activation is worse than not having one.
 *
 * ## The link is a link
 *
 * `?showPlayingStyle=…` is real navigation — it survives a refresh, a share and
 * the back button — so it is an anchor rather than a button with an onClick.
 * `scroll={false}` keeps the grid where the reader left it.
 */
export function PlayingStyleCard({
  style,
  clickable = true,
  className,
}: {
  style: string;
  /** False inside the modal, where the card must not reopen it. */
  clickable?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const info = PLAYING_STYLE_INFO?.[style];

  const body = (
    <>
      <ExemplarCrest name={info?.exemplar ?? ''} imageUrl={info?.imageUrl} />

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{humanizeEnum(style)}</span>
        <span className="text-muted mt-1 block text-xs leading-snug">
          {info ? t.playingStyles?.[info?.key] : ''}
        </span>
        {info?.exemplar && (
          <span className="text-muted mt-1.5 block text-[11px] italic">
            {t.onboarding?.styleLikeWho}: {info?.exemplar}
          </span>
        )}
      </span>
    </>
  );

  const shared = cn(
    'border-border bg-surface flex h-full items-start gap-3 rounded-xl border p-3 text-left',
    className,
  );

  if (!clickable) {
    return <div className={shared}>{body}</div>;
  }

  return (
    <Link
      href={`?showPlayingStyle=${encodeURIComponent(style)}`}
      scroll={false}
      className={cn(
        shared,
        'hover:border-primary/50 hover:bg-surface-2 transition-colors',
        'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
      )}
    >
      {body}
    </Link>
  );
}

/**
 * The exemplar, as a crest.
 *
 * An initialled badge rather than a photograph — see `lib/playing-styles.ts` for
 * why no image ships. If `imageUrl` is ever set it is used instead, so adding a
 * licensed picture is a one-line change and no component edit.
 */
function ExemplarCrest({ name, imageUrl }: { name: string; imageUrl?: string }) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a local static asset; next/image adds a loader for no gain here
      <img
        src={imageUrl}
        alt={name}
        className="size-20 shrink-0 rounded-lg object-contain"
        loading="lazy"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="bg-primary/12 text-primary grid size-20 shrink-0 place-items-center rounded-lg text-lg font-bold"
    >
      {exemplarInitials(name)}
    </span>
  );
}
