import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Video } from 'lucide-react';
import { getSession } from '@/lib/session';
import { isAdminActing, isSuperAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { admin } from '@/lib/api/resources';
import type { Page } from '@/lib/api/client';
import type { PendingClip } from '@/lib/api/types';
import { Alert } from '@/components/ui/Feedback';
import { ModerationTabs } from '../ModerationTabs';
import { VideoReviewQueue } from './VideoReviewQueue';

export const metadata: Metadata = { title: 'Video review' };

const EMPTY: Page<PendingClip> = { items: [], total: 0, page: 1, pageSize: 20 };

/**
 * The admin moderation feed: every clip nobody has watched yet.
 *
 * A clip is invisible to the whole platform between upload and a decision here,
 * so this queue is the only thing standing between a player pressing upload and
 * their video existing for anyone else. It is also the only screen in the product
 * that is served unverified footage, which is why the role is checked before the
 * fetch rather than only around the render — an admin gate that runs after the
 * data has been requested is not a gate.
 *
 * `no-store`: a moderation queue that could be served from a cache would show
 * clips two admins have already decided, and every one of those is a wasted
 * decision that ends in a 409.
 */
export default async function VideoModerationPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/moderation/videos');

  const { t } = await getServerT();
  if (!isAdminActing(session.activeRole)) {
    return <Alert tone="warning">{t.academy.adminOnly}</Alert>;
  }

  const pending = await admin
    .pendingMedia(
      {},
      { token: session.accessToken, activeRole: session.activeRole, cache: 'no-store' },
    )
    .catch(() => EMPTY);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Video className="text-primary size-5" aria-hidden /> {t.admin.videoReview}
        </h1>
        <p className="text-muted text-sm">{t.admin.videoReviewHint}</p>
        <ModerationTabs canSeeBlocked={isSuperAdminActing(session.activeRole)} />
      </header>

      {/* README §11.5: anything involving a child jumps every other queue, and
          this is the queue where that footage is first seen. Stated where the
          work happens, as on the reports queue beside it. */}
      <Alert tone="danger" title={t.dashboard.childSafetyFirst}>
        {t.dashboard.childSafetyBody}
      </Alert>

      <VideoReviewQueue
        initial={pending}
        // The API refuses a plain admin regardless (`@Roles('super_admin')`);
        // this only decides whether to draw a button that would be refused.
        canDelete={isSuperAdminActing(session.activeRole)}
      />
    </div>
  );
}
