'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { PLAYING_STYLE_INFO, exemplarInitials } from '@/lib/playing-styles';
import { cn, humanizeEnum } from '@/lib/utils';
import Link from 'next/link';

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
    <div className="[container-type:inline-size] h-full">
      <div
        className={cn(
          'border-border bg-surface flex h-full flex-col items-center gap-3 rounded-xl border p-3 text-left [@container(min-width:320px)]:!flex-row',
          className,
        )}
      >
        <ExemplarCrest name={info?.exemplar ?? ''} imageUrl={info?.imageUrl} imageSize="xl" />

        <span className="min-w-0 flex-1 text-center [@container(min-width:320px)]:text-start">
          <span className="block text-sm font-semibold text-[#35c26d]">{humanizeEnum(style)}</span>
          <span className="text-muted mt-1 block text-xs leading-snug">
            {info ? t.playingStyles?.[info?.key] : ''}
          </span>
          {info?.exemplar && (
            <span className="text-muted mt-1.5 block text-[11px] italic">
              {t.onboarding?.styleLikeWho}: {info?.exemplar}
            </span>
          )}
        </span>
      </div>
    </div>
  );

  if (!clickable) {
    return body;
  }

  return (
    <Link
      href={`?showPlayingStyle=${encodeURIComponent(style)}`}
      scroll={false}
      className={cn(
        'hover:border-primary/50 hover:bg-surface-2 transition-colors',
        'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
      )}
    >
      {body}
    </Link>
  );
}

type ImageSizeType = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

const getImageSize = (size: ImageSizeType) => {
  switch (size) {
    case 'sm':
      return 'size-16';
    case 'md':
      return 'size-20';
    case 'lg':
      return 'size-24';
    case 'xl':
      return 'size-28';
    case 'xxl':
      return 'size-32';
  }
};

/**
 * The exemplar, as a crest.
 *
 * An initialled badge rather than a photograph — see `lib/playing-styles.ts` for
 * why no image ships. If `imageUrl` is ever set it is used instead, so adding a
 * licensed picture is a one-line change and no component edit.
 */
function ExemplarCrest({
  name,
  imageUrl,
  imageSize = 'md',
}: {
  name: string;
  imageUrl?: string;
  imageSize?: ImageSizeType;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a local static asset; next/image adds a loader for no gain here
      <img
        src={imageUrl}
        alt={name}
        className={cn('shrink-0 rounded-lg object-contain', getImageSize(imageSize))}
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
