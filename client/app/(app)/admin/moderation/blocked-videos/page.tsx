import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ShieldOff } from 'lucide-react';
import { getSession } from '@/lib/session';
import { isSuperAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { admin } from '@/lib/api/resources';
import type { Page } from '@/lib/api/client';
import type { PendingClip } from '@/lib/api/types';
import { Alert } from '@/components/ui/Feedback';
import { Pagination } from '@/components/shared/Pagination';
import { ModerationTabs } from '../ModerationTabs';
import { BlockedVideoList } from './BlockedVideoList';

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
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/moderation/blocked-videos');

  const { t } = await getServerT();
  if (!isSuperAdminActing(session.activeRole)) {
    return <Alert tone="warning">{t.academy.adminOnly}</Alert>;
  }

  const params = await searchParams;
  const page = Number(params?.page ?? 1) || 1;

  const blocked = await admin
    .blockedMedia(
      { page, pageSize: PAGE_SIZE },
      { token: session.accessToken, activeRole: session.activeRole, cache: 'no-store' },
    )
    .catch(() => ({ items: [], total: 0, page, pageSize: PAGE_SIZE }) as Page<PendingClip>);

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
    </div>
  );
}
