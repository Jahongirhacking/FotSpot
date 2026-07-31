'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Lock, Play, Trash2, Trophy } from 'lucide-react';
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
 * ## The video has no address until you ask for one
 *
 * Player footage is private (see StorageService). There is no URL on this object
 * and none in the database — pressing play requests a signed URL that the API
 * issues only after checking who is asking, and which expires in minutes. So a
 * URL copied out of dev tools and pasted elsewhere is dead on arrival, and a
 * viewer who is not allowed to watch never receives one.
 *
 * Asking on demand also happens to be the right thing for bandwidth: a profile
 * holds a dozen of these, and fetching a URL (let alone bytes) for every one
 * would cost a player on mobile data more than the rest of the app (§14).
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

  // Requested on the first press of play, then held for this render only.
  const [requested, setRequested] = React.useState(false);
  const playback = useQuery({
    queryKey: ['media-url', clip.id],
    queryFn: () => browserFetch<{ url: string }>(`/media/${clip.id}/url`),
    enabled: requested,
    // Shorter than the URL's own lifetime, so a refetch always beats expiry.
    staleTime: 2 * 60 * 1000,
    gcTime: 2 * 60 * 1000,
    retry: false,
  });

  return (
    <figure className="border-border bg-surface overflow-hidden rounded-xl border">
      <div className="bg-surface-3 relative aspect-video w-full">
        {playback.data ? (
          <video
            src={playback.data.url}
            controls
            autoPlay
            playsInline
            className="size-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setRequested(true)}
            disabled={playback.isFetching}
            className="text-muted hover:text-foreground grid size-full place-items-center transition-colors"
            aria-label={t.clips.play}
          >
            {playback.isError ? (
              <span className="flex flex-col items-center gap-1 px-3 text-center">
                <Lock className="size-5" aria-hidden />
                <span className="text-xs">{t.clips.notAllowed}</span>
              </span>
            ) : (
              <Play className={playback.isFetching ? 'size-8 animate-pulse' : 'size-8'} aria-hidden />
            )}
          </button>
        )}
      </div>

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
