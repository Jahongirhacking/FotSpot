import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Building2 } from 'lucide-react';
import { academies, recommendations } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { Page } from '@/lib/api/client';
import type { PendingAction } from '@/lib/api/types';
import { EmptyState } from '@/components/ui/Feedback';
import { CandidateList } from './CandidateList';

export const metadata: Metadata = { title: 'Squad candidates' };

const PAGE_SIZE = 12;

/**
 * Every passed player waiting for the manager's answer — the page behind the
 * dashboard's "See all".
 *
 * Resolved from the session, like the squad: a manager runs one academy. The
 * first page is fetched here so the list arrives rendered; the client takes
 * over for the page turns and the two actions on each card.
 *
 * NOTE (Next 16): `searchParams` is a Promise.
 */
export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login?next=/academies/mine/candidates');
  const { t } = await getServerT();

  const opts = {
    token: session?.accessToken,
    activeRole: session?.activeRole,
    cache: 'no-store' as const,
  };
  const academy = await academies.mine(opts).catch(() => null);

  if (!academy) {
    return (
      <EmptyState
        icon={Building2}
        title={t.academy.noAcademyTitle}
        description={t.academy.noAcademyBody}
      />
    );
  }

  const params = await searchParams;
  const page = Number(params?.page ?? 1) || 1;
  const empty: Page<PendingAction> = { items: [], total: 0, page, pageSize: PAGE_SIZE };
  const initial = await recommendations
    .pendingActions({ page, pageSize: PAGE_SIZE }, opts)
    .catch(() => empty);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/dashboard"
        className="text-muted hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden /> {t.common.back}
      </Link>

      <header>
        <h1 className="text-xl font-bold">{t.academy.candidates}</h1>
        <p className="text-muted text-sm">{t.academy.candidatesHint}</p>
      </header>

      <CandidateList page={page} pageSize={PAGE_SIZE} initial={initial} />
    </div>
  );
}
