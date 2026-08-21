'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AcademyPhoto } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { cn } from '@/lib/utils';
import { LoadingImage } from '@/components/ui/LoadingImage';

/**
 * The academy's own photographs — pitch, changing rooms, a squad.
 *
 * ## Why the first one is bigger
 *
 * The manager orders these, and the API documents the lowest `sortOrder` as the
 * cover. A uniform grid throws that ordering away and asks the reader to treat
 * twelve thumbnails as equally important. Giving the cover two columns spends the
 * decision the manager already made.
 *
 * ## Why it opens
 *
 * A thumbnail of a pitch tells you there is a pitch. Whether the surface is
 * decent, whether there are floodlights, whether the changing rooms are somewhere
 * you would leave a child — those are the questions the photographs are here to
 * answer, and none of them survive being 120px wide.
 */
export function AcademyGallery({ photos }: { photos: AcademyPhoto[] }) {
  const { t } = useI18n();
  const [openAt, setOpenAt] = React.useState<number | null>(null);

  // A row whose upload failed carries a null url. Dropped rather than rendered as
  // a broken frame — one missing photo should not look like a broken page.
  const shown = photos?.filter((photo) => photo?.url) ?? [];
  if (shown.length === 0) return null;

  const current = openAt === null ? null : shown[openAt];
  const step = (delta: number) =>
    setOpenAt((at) => (at === null ? null : (at + delta + shown.length) % shown.length));

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((photo, index) => (
          <li
            key={photo?.id}
            className={cn(
              // The cover earns a bigger tile, but only once there are enough
              // photos for the grid to still read as a grid around it.
              index === 0 && shown.length > 2 && 'col-span-2 row-span-2',
            )}
          >
            <button
              type="button"
              onClick={() => setOpenAt(index)}
              className="border-border group relative block aspect-[4/3] w-full overflow-hidden rounded-lg border"
              aria-label={photo?.caption ?? `${t.academy?.galleryTitle} ${index + 1}`}
            >
              { }
              <LoadingImage
                src={photo?.url ?? ''}
                alt={photo?.caption ?? ''}
                loading={index === 0 ? 'eager' : 'lazy'}
                className="size-full object-cover group-hover:scale-105"
              />
              {photo?.caption && (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-left text-xs text-white">
                  {photo?.caption}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={openAt !== null} onOpenChange={(open) => !open && setOpenAt(null)}>
        <DialogContent className="sm:max-w-3xl">
          {/* Radix requires a title for the accessible name; the caption is the
              honest one, and the section name covers a photo without any. */}
          <DialogTitle className="px-5 pt-5 pr-14 text-sm font-medium">
            {current?.caption ?? t.academy?.galleryTitle}
          </DialogTitle>

          <div className="relative bg-black">
            { }
            <LoadingImage
              src={current?.url ?? ''}
              alt={current?.caption ?? ''}
              className="max-h-[70dvh] w-full object-contain"
            />

            {shown.length > 1 && (
              <>
                <GalleryStep side="left" onClick={() => step(-1)} label={t.common?.previous} />
                <GalleryStep side="right" onClick={() => step(1)} label={t.common?.next} />
              </>
            )}
          </div>

          {shown.length > 1 && (
            <p className="text-muted p-3 text-center text-xs">
              {(openAt ?? 0) + 1} / {shown.length}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function GalleryStep({
  side,
  onClick,
  label,
}: {
  side: 'left' | 'right';
  onClick: () => void;
  label: string;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        // Large enough to hit with a thumb, which is how most of these will be
        // browsed (§14).
        'absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70',
        side === 'left' ? 'left-2' : 'right-2',
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
