import type * as React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Video } from 'lucide-react';
import { getSession } from '@/lib/session';
import { isAdminActing, isSuperAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { admin } from '@/lib/api/resources';
import type { Page } from '@/lib/api/client';
import type { MediaStatusFilter, PendingClip } from '@/lib/api/types';
import { Alert } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/shared/Pagination';
import { cn } from '@/lib/utils';
import { ModerationTabs } from '../ModerationTabs';
import { StatusVideoList } from './StatusVideoList';
import { VideoReviewQueue } from './VideoReviewQueue';

export const metadata: Metadata = { title: 'Video review' };

const PAGE_SIZE = 20;
const EMPTY: Page<PendingClip> = { items: [], total: 0, page: 1, pageSize: PAGE_SIZE };

/** The worker's statuses, in the order the chips show them. */
const STATUS_FILTERS: MediaStatusFilter[] = [
  'ALL',
  'PROCESSING',
  'ACTIVE',
  'FAILED',
  'FLAGGED',
  'REMOVED',
];

function statusFilter(raw: string | undefined): MediaStatusFilter | null {
  const upper = raw?.toUpperCase();
  return STATUS_FILTERS.find((status) => status === upper) ?? null;
}

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
export default async function VideoModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/moderation/videos');

  const { t } = await getServerT();
  if (!isAdminActing(session.activeRole)) {
    return <Alert tone="warning">{t.academy.adminOnly}</Alert>;
  }

  /*
   * The page is in the URL, like the blocked list beside it. The queue used to
   * fetch with no page at all, which was the API's first twenty — the twenty-
   * first clip a player uploaded existed and was reviewable by nobody, and
   * nothing on the screen said there was more.
   */
  const params = await searchParams;
  const page = Number(params?.page ?? 1) || 1;
  /*
   * Two lists behind one screen. With no `status`, this is the review queue it
   * has always been. With one, it is the same videos by the worker's status —
   * which is where a clip stuck at PROCESSING, or one the worker gave up on,
   * is found. The counts are fetched either way, so the chips can say that
   * there *are* three videos processing while the admin is looking at the
   * queue that, by definition, cannot show them.
   */
  const status = statusFilter(params?.status);
  const opts = {
    token: session.accessToken,
    activeRole: session.activeRole,
    cache: 'no-store' as const,
  };
  // A list that could not be fetched is not an empty queue: with the API's
  // database away, this page used to read "no pending clips", which is the
  // one thing a moderator must never be told by mistake.
  const [counts, listResult] = await Promise.all([
    admin.mediaCounts(opts).catch(() => null),
    (status
      ? admin.mediaByStatus({ status, page, pageSize: PAGE_SIZE }, opts)
      : admin.pendingMedia({ page, pageSize: PAGE_SIZE }, opts)
    )
      .then((data) => ({ data, unavailable: false }))
      .catch(() => ({ data: { ...EMPTY, page }, unavailable: true })),
  ]);
  const list = listResult.data;
  const listUnavailable = listResult.unavailable;
  const isSuperAdmin = isSuperAdminActing(session.activeRole);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Video className="text-primary size-5" aria-hidden /> {t.admin.videoReview}
        </h1>
        <p className="text-muted text-sm">{t.admin.videoReviewHint}</p>
        <ModerationTabs canSeeBlocked={isSuperAdmin} />

        {/* The worker's axis. The first chip is the queue; the rest are statuses. */}
        <nav className="flex flex-wrap gap-1.5" aria-label={t.admin.statusFilterLabel}>
          <FilterChip href="/admin/moderation/videos" active={status === null}>
            {t.admin.awaitingReview}
          </FilterChip>
          {STATUS_FILTERS.map((filter) => (
            <FilterChip
              key={filter}
              href={`/admin/moderation/videos?status=${filter}`}
              active={status === filter}
            >
              {t.admin.statusLabels[filter]}
              {counts && counts[filter] > 0 && (
                <Badge
                  variant={filter === 'PROCESSING' || filter === 'FAILED' ? 'warning' : 'neutral'}
                  className="ml-1"
                >
                  {counts[filter]}
                </Badge>
              )}
            </FilterChip>
          ))}
        </nav>
        {status === 'PROCESSING' && <p className="text-muted text-xs">{t.admin.stuckHint}</p>}
      </header>

      {/* README §11.5: anything involving a child jumps every other queue, and
          this is the queue where that footage is first seen. Stated where the
          work happens, as on the reports queue beside it. */}
      <Alert tone="danger" title={t.dashboard.childSafetyFirst}>
        {t.dashboard.childSafetyBody}
      </Alert>

      {listUnavailable && <Alert tone="danger">{t.admin.listUnavailable}</Alert>}

      {status ? (
        <>
          {/* Retry is the super admin's, like the failed-uploads section: the
              API refuses a plain admin regardless (`@Roles('super_admin')`). */}
          <StatusVideoList clips={list.items} canRetry={isSuperAdmin} />
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} />
        </>
      ) : (
        <VideoReviewQueue
          initial={list}
          page={page}
          pageSize={PAGE_SIZE}
          // The API refuses a plain admin regardless (`@Roles('super_admin')`);
          // this only decides whether to draw a button that would be refused.
          canDelete={isSuperAdmin}
        />
      )}
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border hover:border-primary/50',
      )}
    >
      {children}
    </Link>
  );
}
