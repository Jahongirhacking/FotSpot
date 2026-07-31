'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Trash2, Trophy } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Media } from '@/lib/api/types';
import { CATEGORY_ATTRIBUTE } from '@/lib/player-card';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';

/**
 * One clip, with the claim it was uploaded to support.
 *
 * `preload="none"` and a poster-less `<video>`: a profile can hold a dozen of
 * these, and preloading them all would cost a player on mobile data more than the
 * rest of the app put together (§14). The browser fetches bytes when someone
 * presses play.
 */
export function ClipCard({
  clip,
  canDelete,
  isCurrent,
  onDeleted,
}: {
  clip: Media;
  canDelete: boolean;
  /** True when this is the newest claim for its attribute — the one on the bar. */
  isCurrent?: boolean;
  onDeleted?: (id: string) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () => browserFetch(`/media/${clip.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      onDeleted?.(clip.id);
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const attribute = CATEGORY_ATTRIBUTE[clip.category];
  const isHighlight = clip.category === 'MATCH_HIGHLIGHTS';

  return (
    <figure className="border-border bg-surface overflow-hidden rounded-xl border">
      <video
        src={clip.url}
        controls
        playsInline
        preload="none"
        className="bg-surface-3 aspect-video w-full"
      />

      <figcaption className="space-y-1.5 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {isHighlight ? (
            <Badge variant="accent">
              <Trophy className="size-3" aria-hidden /> {t.attributes.highlights}
            </Badge>
          ) : (
            <>
              <Badge variant="primary">{attribute ? t.attributes[attribute] : clip.category}</Badge>
              {clip.selfRating != null && (
                <span className="text-prov-self font-mono text-sm font-bold">
                  {clip.selfRating}
                </span>
              )}
              {isCurrent && <Badge variant="outline">{t.clips.currentClaim}</Badge>}
            </>
          )}
          <span className="text-muted ml-auto text-[11px]">{formatDate(clip.createdAt)}</span>
        </div>

        {clip.title && <p className="truncate text-sm font-medium">{clip.title}</p>}
        {clip.description && <p className="text-muted text-xs">{clip.description}</p>}

        {error && <p className="text-danger text-xs">{error}</p>}

        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(t.clips.confirmDelete)) remove.mutate();
            }}
          >
            <Trash2 aria-hidden /> {t.common.delete}
          </Button>
        )}
      </figcaption>
    </figure>
  );
}
