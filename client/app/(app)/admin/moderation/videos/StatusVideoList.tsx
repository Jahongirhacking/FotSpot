'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Clock, RefreshCw, TriangleAlert, Video } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Media, MediaStatus, PendingClip } from '@/lib/api/types';
import { CATEGORY_ATTRIBUTE } from '@/lib/player-card';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { ageBand, formatDateTime, initials, relativeTime } from '@/lib/utils';

/** Server-side bound on restarts; shown as "n / 3" so an admin knows when it gave up. */
const MAX_RESTARTS = 3;

const STATUS_TONE: Record<MediaStatus, 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  PROCESSING: 'info',
  ACTIVE: 'success',
  FAILED: 'warning',
  FLAGGED: 'danger',
  REMOVED: 'neutral',
};

/**
 * Every video in one processing status — the list a stuck upload was missing from.
 *
 * ## Why this is not the review queue
 *
 * The review queue beside it is filtered on what a moderator has decided, and a
 * clip that is still PROCESSING has nothing to decide: nobody can watch a file
 * the worker has not confirmed. So it was on no screen. This list is filtered
 * on the worker's axis instead, and for a PROCESSING clip it shows the thing
 * that tells "slow" from "stuck": whether the queue still has a live job for it.
 *
 * ## Retry, not "set active"
 *
 * The one action re-runs processing. For a FAILED clip that is the same
 * re-check the failed-uploads section offers; for a stuck PROCESSING clip it
 * queues the same job the upload queued, and the row stays PROCESSING until
 * that job answers. Nothing here can publish a clip whose file was never found.
 */
export function StatusVideoList({ clips, canRetry }: { clips: PendingClip[]; canRetry: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const retry = useMutation({
    mutationFn: (id: string) =>
      browserFetch<Media>(`/moderation/media/${id}/retry`, { method: 'PATCH' }),
    onSuccess: (media) => {
      setError(null);
      setNotice(
        media?.status === 'ACTIVE'
          ? t.admin.retryNowInQueue
          : media?.status === 'PROCESSING'
            ? t.admin.retryRestarted
            : (media?.failureReason ?? t.admin.retryStillFailed),
      );
      // Server-rendered list: the server says what the row looks like now.
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  if (clips.length === 0) {
    return (
      <EmptyState
        icon={Video}
        title={t.admin.noClipsForStatus}
        description={t.admin.noClipsForStatusHint}
      />
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}

      {clips.map((clip) => (
        <StatusCard
          key={clip.id}
          clip={clip}
          canRetry={canRetry}
          busy={retry.isPending && retry.variables === clip.id}
          onRetry={() => retry.mutate(clip.id)}
        />
      ))}
    </div>
  );
}

function StatusCard({
  clip,
  canRetry,
  busy,
  onRetry,
}: {
  clip: PendingClip;
  canRetry: boolean;
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

  // A stuck clip is one nothing is working on; a slow one still has a live job.
  const stuck = clip.status === 'PROCESSING' && clip.processing?.live === false;
  const retryable = canRetry && (clip.status === 'FAILED' || stuck);

  return (
    <Card className={stuck || clip.status === 'FAILED' ? 'border-warning/40' : undefined}>
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
          <Badge variant={STATUS_TONE[clip.status]}>
            {clip.status === 'PROCESSING' ? (
              <Clock aria-hidden />
            ) : clip.status === 'FAILED' ? (
              <TriangleAlert aria-hidden />
            ) : null}{' '}
            {t.admin.statusLabels[clip.status]}
          </Badge>
          {clip.status === 'ACTIVE' && clip.moderationStatus && (
            <Badge variant="neutral">{t.admin.moderationLabels[clip.moderationStatus]}</Badge>
          )}
          <Badge variant="neutral">{label}</Badge>
        </header>

        {clip.status === 'PROCESSING' && (
          <ProcessingDetail clip={clip} stuck={stuck} maxRestarts={MAX_RESTARTS} />
        )}

        {clip.status === 'FAILED' && (
          <p className="bg-surface-3 rounded-lg p-3 text-sm">
            <span className="text-muted mr-1">{t.admin.failureReason}:</span>
            {clip.failureReason ?? '—'}
          </p>
        )}

        {clip.title && <p className="text-sm font-medium">{clip.title}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted text-xs">
            {t.admin.uploadedAt}: {formatDateTime(clip.createdAt)}
          </p>
          {retryable && (
            <Button size="sm" className="ml-auto" loading={busy} onClick={onRetry}>
              <RefreshCw aria-hidden /> {t.admin.retryProcessing}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * What an admin needs to judge a PROCESSING clip: how long, whether anything is
 * still working on it, how many attempts and restarts it has had, and what the
 * last attempt said.
 */
function ProcessingDetail({
  clip,
  stuck,
  maxRestarts,
}: {
  clip: PendingClip;
  stuck: boolean;
  maxRestarts: number;
}) {
  const { t } = useI18n();
  const job = clip.processing;
  const state = job ? (t.admin.jobStates[job.state] ?? job.state) : t.admin.jobStates.unknown;

  return (
    <dl className="bg-surface-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg p-3 text-sm">
      <dt className="text-muted">{t.admin.processingSince}</dt>
      <dd>
        {formatDateTime(clip.createdAt)}{' '}
        <span className="text-muted">({relativeTime(clip.createdAt)})</span>
      </dd>
      <dt className="text-muted">{t.admin.jobState}</dt>
      <dd className={stuck ? 'text-warning font-medium' : undefined}>{state}</dd>
      <dt className="text-muted">{t.admin.jobAttempts}</dt>
      <dd>{job?.attemptsMade ?? '—'}</dd>
      <dt className="text-muted">{t.admin.restarts}</dt>
      <dd>
        {clip.processingAttempts ?? 0} / {maxRestarts}
      </dd>
      {job?.failedReason && (
        <>
          <dt className="text-muted">{t.admin.lastError}</dt>
          <dd className="break-words">{job.failedReason}</dd>
        </>
      )}
    </dl>
  );
}
