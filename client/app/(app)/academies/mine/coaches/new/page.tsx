import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { academies } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import { AddCoach } from '@/app/(app)/academies/[id]/roster/AddCoach';
import { EmptyState } from '@/components/ui/Feedback';

export const metadata: Metadata = { title: 'Add a coach' };

/**
 * A page of its own for hiring a coach.
 *
 * The same form lives on the roster's coaches tab, where a manager already
 * looking at their staff would expect it. This route exists so the action can be
 * reached in one press from anywhere — creating an account and reading out the
 * credentials is a task somebody sits down to do, not something they stumble
 * into while scrolling a list.
 */
export default async function NewCoachPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/academies/mine/coaches/new');
  const { t } = await getServerT();

  const academy = await academies
    .mine({ token: session.accessToken, cache: 'no-store' })
    .catch(() => null);

  if (!academy) {
    return (
      <EmptyState
        icon={Building2}
        title={t.academy.noAcademyTitle}
        description={t.academy.noAcademyBody}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-bold">{t.academy.addCoach}</h1>
        <p className="text-muted text-sm">{t.academy.addCoachHint}</p>
      </header>

      <AddCoach academyId={academy.id} defaultOpen />

      <p className="text-muted text-sm">
        <Link
          href={`/academies/${academy.id}/roster?role=COACH`}
          className="text-primary hover:underline"
        >
          {t.academy.roster}
        </Link>
      </p>
    </div>
  );
}
