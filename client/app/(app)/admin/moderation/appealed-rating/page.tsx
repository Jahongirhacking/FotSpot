import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Scale } from 'lucide-react';
import { admin } from '@/lib/api/resources';
import type { AppealedClip } from '@/lib/api/types';
import type { Page } from '@/lib/api/client';
import { getSession } from '@/lib/session';
import { isAdminActing, isSuperAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { Alert } from '@/components/ui/Feedback';
import { Pagination } from '@/components/shared/Pagination';
import { ModerationTabs } from '../ModerationTabs';
import { AppealReviewList } from './AppealReviewList';

export const metadata: Metadata = { title: 'Appealed ratings' };

const PAGE_SIZE = 10;

/**
 * Players' appeals against the ratings on their clips, oldest first.
 *
 * Its own page rather than a tab inside the review queue: an appeal is a
 * different question from "is this clip fit to publish" — the clip is
 * already live, somebody has judged it, and the player says the judgement
 * is wrong. The card puts the four things that decide it side by side: the
 * footage, the current number, the attribute it was filed under, and the
 * player's own words.
 *
 * NOTE (Next 16): `searchParams` is a Promise.
 */
export default async function AppealedRatingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/moderation/appealed-rating');
  const { t } = await getServerT();
  if (!isAdminActing(session.activeRole)) {
    return <Alert tone="warning">{t.academy.adminOnly}</Alert>;
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params?.page) || 1);
  const status = params?.status === 'RESOLVED' ? 'RESOLVED' : 'PENDING';
  const opts = {
    token: session.accessToken,
    activeRole: session.activeRole,
    cache: 'no-store' as const,
  };
  const empty: Page<AppealedClip> = { items: [], total: 0, page, pageSize: PAGE_SIZE };
  let list = empty;
  let listUnavailable = false;
  try {
    list = await admin.listAppeals({ status, page, pageSize: PAGE_SIZE }, opts);
  } catch {
    listUnavailable = true;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-3">
        <ModerationTabs canSeeBlocked={isSuperAdminActing(session.activeRole)} />
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Scale className="text-primary size-5" aria-hidden /> {t.admin.appealedRatings}
          </h1>
          <p className="text-muted text-sm">{t.admin.appealedRatingsHint}</p>
        </div>
      </header>

      {listUnavailable && <Alert tone="danger">{t.admin.listUnavailable}</Alert>}

      <AppealReviewList initial={list} page={page} pageSize={PAGE_SIZE} status={status} />
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} />
    </div>
  );
}
