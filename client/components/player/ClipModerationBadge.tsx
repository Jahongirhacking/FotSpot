'use client';

import { CheckCircle2, Clock, ShieldOff } from 'lucide-react';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import type { MediaModerationStatus } from '@/lib/api/types';
import { cn } from '@/lib/utils';

/**
 * What the moderation state of a clip looks like to the person who uploaded it.
 *
 * ## Only the owner ever sees this
 *
 * Not a permission this component enforces — it cannot, and it does not try. The
 * API only ever returns a non-VERIFIED clip to its own uploader (see
 * `MediaService.listForPlayer`), so anything other than VERIFIED arriving here
 * means the reader is the player whose clip it is. This is the label for that
 * case, not the gate on it.
 *
 * ## Why "waiting" is stated rather than implied
 *
 * A player presses upload and their clip does not appear in the feed. Without a
 * word from the product, the two readings available to them are "it is broken"
 * and "nobody wants it", and the first is the one that makes them upload it
 * again. One sentence — this is in review, only you can see it — turns a silent
 * absence into a normal step, and it is the difference between a moderation queue
 * that works and a support inbox that fills up.
 *
 * Blocked is told to the owner too, deliberately. A clip that silently vanishes
 * is indistinguishable from a bug; a clip marked as taken down is a decision they
 * can see, and it is theirs to delete. What is *not* told is why or by whom —
 * that is moderation detail, and the owner is not the audience for it.
 */

const STATE = {
  UNVERIFIED: { icon: Clock, variant: 'warning' as const },
  VERIFIED: { icon: CheckCircle2, variant: 'success' as const },
  BLOCKED: { icon: ShieldOff, variant: 'danger' as const },
};

/** The label and the one-line explanation, in the reader's language. */
export function useClipModerationCopy(status: MediaModerationStatus) {
  const { t } = useI18n();
  switch (status) {
    case 'BLOCKED':
      return { label: t.clips.moderationBlocked, hint: t.clips.moderationBlockedHint };
    case 'VERIFIED':
      return { label: t.clips.moderationVerified, hint: t.clips.moderationVerifiedHint };
    default:
      return { label: t.clips.awaitingReview, hint: t.clips.awaitingReviewHint };
  }
}

/**
 * The compact form, for a corner of a tile in the grid.
 *
 * Verified is drawn as nothing at all: it is the state every clip on a public
 * profile is in, so a green tick on all of them would be a badge that says only
 * "this is a clip". The badge exists to mark the exceptions.
 */
export function ClipModerationBadge({
  status,
  className,
}: {
  status?: MediaModerationStatus;
  className?: string;
}) {
  const copy = useClipModerationCopy(status ?? 'VERIFIED');
  if (!status || status === 'VERIFIED') return null;

  const { icon: Icon, variant } = STATE[status];

  return (
    <Badge variant={variant} className={cn('shadow-sm', className)} title={copy.hint}>
      <Icon aria-hidden />
      <span className="truncate">{copy.label}</span>
    </Badge>
  );
}

/** The full form: "Status: Waiting for verification", plus what that means. */
export function ClipModerationNote({ status }: { status?: MediaModerationStatus }) {
  const { t } = useI18n();
  const copy = useClipModerationCopy(status ?? 'VERIFIED');
  if (!status || status === 'VERIFIED') return null;

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-sm',
        status === 'BLOCKED' ? 'border-danger/40 bg-danger/8' : 'border-warning/40 bg-warning/8',
      )}
    >
      <p className="flex items-center gap-1.5 font-medium">
        <ClipModerationBadge status={status} />
        <span className="text-muted text-xs">{t.clips.moderationLabel}</span>
      </p>
      <p className="text-muted mt-1 text-xs">{copy.hint}</p>
    </div>
  );
}
