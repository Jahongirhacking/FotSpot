import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2, CalendarDays, MapPin, Users } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { academies, academyRoster, trials } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import type { AcademyMember, AcademyProfile, Trial } from '@/lib/api/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getServerT } from '@/lib/i18n/server';
import { RelationBadge } from '@/components/shared/RelationBadge';
import { formatDate } from '@/lib/utils';
import { FollowAcademyButton } from './FollowAcademyButton';
import { AcademyProfileEditor } from './AcademyProfileEditor';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const academy = await academies.getById(id, { revalidate: 300 });
    return { title: academy.name };
  } catch {
    return { title: 'Academy' };
  }
}

export default async function AcademyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  let academy: AcademyProfile;
  try {
    academy = await academies.getById(
      id,
      session ? { token: session.accessToken, cache: 'no-store' } : { revalidate: 300 },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const { t } = await getServerT();

  // Only for signed-in viewers, and failure is silent: the badge is a courtesy,
  // not information the page is about.
  const relation = session
    ? await academies
        .relation(id, {
          token: session.accessToken,
          activeRole: session.activeRole,
          cache: 'no-store',
        })
        .then((result) => result.relation)
        .catch(() => null)
    : null;

  const academyTrials = await trials
    .listForAcademy(
      id,
      session ? { token: session.accessToken, cache: 'no-store' } : { revalidate: 300 },
    )
    .catch(() => [] as Trial[]);

  /*
   * Everything the manager owns about how this academy presents itself.
   *
   * The roster is fetched only for them, because it is what the featured
   * pickers choose from — a visitor has no use for it and should not pay for
   * the request.
   */
  const isManager = relation === 'MANAGER';
  const roster = isManager
    ? await academyRoster
        .list(id, {}, { token: session!.accessToken, cache: 'no-store' })
        .catch(() => [] as AcademyMember[])
    : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="bg-primary/12 text-primary grid size-14 shrink-0 place-items-center rounded-2xl">
            <Building2 className="size-7" aria-hidden />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">{academy.name}</h1>
              <RelationBadge relation={relation} t={t} />
            </div>
            <p className="text-muted mt-1 flex items-center gap-1 text-sm">
              <MapPin className="size-3.5" aria-hidden />
              {academy.region ?? 'Uzbekistan'}
              {academy.district ? ` · ${academy.district}` : ''}
            </p>
            <div className="mt-2">
              {academy.status === 'VERIFIED' ? (
                <Badge variant="success">{t.academy.verifiedAcademy}</Badge>
              ) : (
                <Badge variant="warning">{t.academy.awaitingVerification}</Badge>
              )}
            </div>
          </div>
        </div>
        <FollowAcademyButton academyId={academy.id} />
      </header>

      {academy.description && (
        <Card>
          <CardContent className="p-5 text-sm">{academy.description}</CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="text-primary size-4" aria-hidden /> Open trials
            </CardTitle>
          </CardHeader>
          <CardContent>
            {academyTrials.length === 0 ? (
              <p className="text-muted text-sm">{t.academy.noTrialsNow}</p>
            ) : (
              <ul className="divide-border divide-y">
                {academyTrials.map((trial) => (
                  <li key={trial.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/trials/${trial.id}`} className="font-medium hover:underline">
                        {trial.title}
                      </Link>
                      <p className="text-muted text-xs">
                        {formatDate(trial.date)} · {trial.location} · ages {trial.ageRangeMin}–
                        {trial.ageRangeMax}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/trials/${trial.id}`}>View</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="text-primary size-4" aria-hidden /> Staff
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted text-sm">
              {academy.members?.length ?? 0} member
              {(academy.members?.length ?? 0) === 1 ? '' : 's'} — managers, coaches and scouts.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Only for the manager: the API refuses every one of these routes to
          anybody else, so this is about not showing controls that would 403. */}
      {isManager && (
        <div className="lg:col-span-2">
          <AcademyProfileEditor academy={academy} members={roster} />
        </div>
      )}
    </div>
  );
}
