import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Flag } from 'lucide-react';
import { getSession } from '@/lib/session';
import { isAdminActing, isSuperAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { admin, type Report } from '@/lib/api/resources';
import { ModerationQueue } from './ModerationQueue';
import { ModerationTabs } from './ModerationTabs';
import { Alert } from '@/components/ui/Feedback';

export const metadata: Metadata = { title: 'Moderation' };

export default async function ModerationPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/moderation');

  const { t } = await getServerT();
  const isAdmin = isAdminActing(session?.activeRole);
  if (!isAdmin) return <Alert tone="warning">{t.academy.adminOnly}</Alert>;

  const reports = await admin
    .pendingReports(
      {},
      { token: session?.accessToken, activeRole: session?.activeRole, cache: 'no-store' },
    )
    .then((page) => page.items)
    .catch(() => [] as Report[]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Flag className="text-primary size-5" aria-hidden /> {t.admin.moderation}
        </h1>
        <p className="text-muted text-sm">{t.admin.moderationHint}</p>
        {/* Video review is the other half of this job and is easy to forget it
            exists — a queue nobody visits is a queue of clips no player can
            share. It sits beside the reports rather than behind a menu. */}
        <ModerationTabs canSeeBlocked={isSuperAdminActing(session?.activeRole ?? null)} />
      </header>

      {/* README §11.5: a child-safety report is a sub-one-hour target and jumps
          every other queue. Stated where the queue is worked. */}
      <Alert tone="danger" title={t.dashboard.childSafetyFirst}>
        {t.dashboard.childSafetyBody}
      </Alert>

      <ModerationQueue initial={reports} />
    </div>
  );
}
