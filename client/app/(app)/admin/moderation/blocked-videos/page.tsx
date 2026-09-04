import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ShieldOff, TriangleAlert } from 'lucide-react';
import { getSession } from '@/lib/session';
import { isSuperAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { admin } from '@/lib/api/resources';
import type { Page } from '@/lib/api/client';
import type { PendingClip } from '@/lib/api/types';
import { Alert } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/shared/Pagination';
import { ModerationTabs } from '../ModerationTabs';
import { BlockedVideoList } from './BlockedVideoList';
import { FailedUploadList } from './FailedUploadList';

export const metadata: Metadata = { title: 'Blocked videos' };

const PAGE_SIZE = 10;

/**
 * Everything the platform has blocked — **super admin only**.
 *
 * The role is checked before the fetch, not around the render: an admin gate
 * that runs after the data has been requested is not a gate. The API refuses a
 * plain admin independently (`@Roles('super_admin')` on the route), so this is
 * the courtesy, not the rule.
 *
 * `no-store`, because a super admin deleting a clip here has to see it gone on
 * the refresh that follows — a cached page would show them the row they just
 * destroyed.
 *
 * NOTE (Next 16): `searchParams` is a Promise.
 */
export default async function BlockedVideosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; failedPage?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/moderation/blocked-videos');

  const { t } = await getServerT();
  if (!isSuperAdminActing(session.activeRole)) {
    return <Alert tone="warning">{t.academy.adminOnly}</Alert>;
  }

  const params = await searchParams;
  const page = Number(params?.page ?? 1) || 1;
  const failedPage = Number(params?.failedPage ?? 1) || 1;

  const opts = {
    token: session.accessToken,
    activeRole: session.activeRole,
    cache: 'no-store' as const,
  };
  const empty = (p: number): Page<PendingClip> => ({
    items: [],
    total: 0,
    page: p,
    pageSize: PAGE_SIZE,
  });

  /*
   * Two lists, two pages, two fetches — independent, so a failure in one leaves
   * the other on screen, and turning a page of one leaves the other where it was.
   */
  const [blocked, failed] = await Promise.all([
    admin.blockedMedia({ page, pageSize: PAGE_SIZE }, opts).catch(() => empty(page)),
    admin
      .failedMedia({ page: failedPage, pageSize: PAGE_SIZE }, opts)
      .catch(() => empty(failedPage)),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ShieldOff className="text-danger size-5" aria-hidden /> {t.admin.blockedVideos}
        </h1>
        <p className="text-muted text-sm">{t.admin.blockedVideosHint}</p>
        <ModerationTabs canSeeBlocked />
      </header>

      <BlockedVideoList clips={blocked.items} />

      <Pagination page={blocked.page} pageSize={blocked.pageSize} total={blocked.total} />

      {/*
        Uploads the platform could not process, kept apart from the takedowns
        above. A moderator blocked those; nobody has watched these — the worker
        reported it could not confirm the file, and in one whole class of cases
        (a host with no ffmpeg) that was the platform's fault, not the player's.
        Same page because the same person owns both; own section and own pager
        because they are not the same kind of thing.
      */}
      <section className="space-y-3 pt-2" aria-labelledby="failed-uploads">
        <h2 id="failed-uploads" className="flex items-center gap-2 text-lg font-semibold">
          <TriangleAlert className="text-warning size-5" aria-hidden /> {t.admin.failedUploads}
          {failed.total > 0 && <Badge variant="warning">{failed.total}</Badge>}
        </h2>
        <p className="text-muted text-sm">{t.admin.failedUploadsHint}</p>

        <FailedUploadList clips={failed.items} />

        <Pagination
          page={failed.page}
          pageSize={failed.pageSize}
          total={failed.total}
          param="failedPage"
        />
      </section>
    </div>
  );
}
