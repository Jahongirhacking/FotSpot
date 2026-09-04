'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Media, PendingClip } from '@/lib/api/types';
import { CATEGORY_ATTRIBUTE } from '@/lib/player-card';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { ageBand, formatDate, initials } from '@/lib/utils';

/**
 * Uploads the platform's own processing gave up on, and the way to try again.
 *
 * ## Why this is not the blocked list, though it sits beside it
 *
 * A blocked clip is a moderator's decision about a video they watched. A failed
 * upload is the worker's report that it could not confirm the file — and one
 * class of that report was the platform's fault: a host with no ffmpeg marked
 * every uncompressed upload "Video processing is unavailable on the server".
 * Listing the two together as "not live" would hide exactly that distinction,
 * so this section states the failure reason on every card and offers the one
 * action that is honest for it.
 *
 * ## Retry, not "set active"
 *
 * The button re-runs the same checks the worker makes. If the file is in storage
 * and sound, the clip becomes ACTIVE — and UNVERIFIED, so it then appears in the
 * review queue for a moderator like any other upload. If it is not, it is failed
 * again with a reason that is true now. A super admin cannot publish a row with
 * nothing behind it from here, which is the invariant PROCESSING exists for.
 */
export function FailedUploadList({ clips }: { clips: PendingClip[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const retry = useMutation({
    mutationFn: (id: string) =>
      browserFetch<Media>(`/moderation/media/${id}/retry`, { method: 'PATCH' }),
    onSuccess: (media) => {
      setError(null);
      // The answer is on the row that came back: ACTIVE means it is now in the
      // review queue; FAILED means storage still has nothing under that key.
      setNotice(
        media?.status === 'ACTIVE'
          ? t.admin.retryNowInQueue
          : (media?.failureReason ?? t.admin.retryStillFailed),
      );
      // Server-rendered list, so the server says whether it left this page.
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  if (clips.length === 0) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title={t.admin.noFailedUploads}
        description={t.admin.noFailedUploadsHint}
      />
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}

      {clips.map((clip) => (
        <FailedCard
          key={clip.id}
          clip={clip}
          busy={retry.isPending && retry.variables === clip.id}
          onRetry={() => retry.mutate(clip.id)}
        />
      ))}
    </div>
  );
}

function FailedCard({
  clip,
  busy,
  onRetry,
}: {
  clip: PendingClip;
  busy: boolean;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const attribute = CATEGORY_ATTRIBUTE[clip.category];
  const label =
    clip.category === 'MATCH_HIGHLIGHTS'
      ? t.attributes.highlights
      : attribute
        ? t.attributes[attribute]
        : clip.category;
  const name = [clip.player.firstName, clip.player.lastName].filter(Boolean).join(' ');

  return (
    <Card className="border-warning/40">
      <CardContent className="space-y-3 p-4">
        <header className="flex flex-wrap items-center gap-3">
          <Link
            href={`/players/${clip.player.id}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <Avatar
              src={clip.player.avatarUrl}
              fallback={initials(clip.player.firstName, clip.player.lastName)}
              className="size-9"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="text-muted block truncate text-xs">
                {[clip.player.primaryPosition, ageBand(clip.player.birthDate), clip.player.region]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          </Link>
          <Badge variant="warning">
            <TriangleAlert aria-hidden /> {t.admin.failedBadge}
          </Badge>
          <Badge variant="neutral">{label}</Badge>
        </header>

        {/* The worker's own words — this is the fact the admin is acting on, and
            it is the line that tells "the platform broke" from "the file is bad". */}
        <p className="bg-surface-3 rounded-lg p-3 text-sm">
          <span className="text-muted mr-1">{t.admin.failureReason}:</span>
          {clip.failureReason ?? '—'}
        </p>

        {clip.title && <p className="text-sm font-medium">{clip.title}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted text-xs">
            {t.admin.uploadedAt}: {formatDate(clip.createdAt)}
          </p>
          <Button size="sm" className="ml-auto" loading={busy} onClick={onRetry}>
            <RefreshCw aria-hidden /> {t.admin.retryProcessing}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
