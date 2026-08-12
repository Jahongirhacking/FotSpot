import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, ClipboardList, Hourglass, MapPin } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { academies, trials } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { Trial } from '@/lib/api/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { ApplyToTrialButton } from './ApplyToTrialButton';
import { Applicants } from './Applicants';
import { CoachSheet } from './CoachSheet';
import { TrialAdmin } from './TrialAdmin';
import { TrialStaff } from './TrialStaff';
import { formatDate } from '@/lib/utils';
import { TrialNote } from '@/components/trials/TrialNote';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const trial = await trials?.getById(id, { revalidate: 300 });
    return { title: trial?.title };
  } catch {
    return { title: 'Trial' };
  }
}

export default async function TrialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const { t } = await getServerT();

  let trial: Trial;
  try {
    trial = await trials?.getById(
      id,
      session ? { token: session?.accessToken, cache: 'no-store' } : { revalidate: 300 },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const applications = session
    ? await trials?.myApplications({ token: session?.accessToken, cache: 'no-store' }).catch(() => [])
    : [];

  const existing = applications?.find((application) => application?.trialId === id);

  /*
   * The hosting academy sees who applied; everyone else sees the apply button.
   * Resolved from the caller's relation to *this* academy rather than from their
   * role, so an academy manager reading another academy's trial is a candidate's
   * view, not a manager's.
   */
  const [academy, relation, coaching] = await Promise.all([
    academies.getById(trial?.academyId, { revalidate: 300 }).catch(() => null),
    session
      ? academies
          .relation(trial?.academyId, { token: session?.accessToken, cache: 'no-store' })
          .catch(() => null)
      : null,
    /*
     * "Am I working this trial?" asked directly, rather than fetching the
     * assigned coaches and looking for myself in them — the session carries no
     * user id, and this is the same question in one request.
     */
    session?.activeRole === 'coach'
      ? trials?.myCoaching({ token: session?.accessToken, cache: 'no-store' }).catch(() => [])
      : [],
  ]);
  const hosts = relation?.relation === 'MANAGER';
  const works = coaching?.some((assigned) => assigned.id === id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          {/* A private trial states no age range: it is for one named child who
              was already chosen, so there is no rule to show them. */}
          {trial?.ageRangeMin != null && trial?.ageRangeMax != null && (
            <Badge variant="primary">
              {t.trials.ages} {trial?.ageRangeMin}–{trial?.ageRangeMax}
            </Badge>
          )}
          {trial?.type === 'PRIVATE' && <Badge variant="warning">{t.trials.typePrivate}</Badge>}
          {trial?.status === 'ARCHIVED' && (
            <Badge variant="neutral">{t.trials.statusArchived}</Badge>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{trial?.title}</h1>
        <dl className="text-muted mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-4" aria-hidden />
            <dt className="sr-only">{t.trials.examDate}</dt>
            <dd>{formatDate(trial?.date)}</dd>
          </div>
          {/* The two dates are different promises — when to turn up, and by when
              to say you are coming — so both are on the page, not just the one. */}
          {trial?.applyDeadline && (
            <div className="flex items-center gap-1.5">
              <Hourglass className="size-4" aria-hidden />
              <dt className="sr-only">{t.trials.applyDeadline}</dt>
              <dd>
                {t.trials.applyDeadline}: {formatDate(trial?.applyDeadline)}
              </dd>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden />
            <dt className="sr-only">{t.trials.location}</dt>
            <dd>{trial?.location}</dd>
          </div>
        </dl>
        <p className="text-muted mt-2 text-sm">
          {t.academy.hostedBy}{' '}
          <Link href={`/academies/${trial?.academyId}`} className="text-primary hover:underline">
            {academy?.name ?? t.nav.academies}
          </Link>
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="text-primary size-4" aria-hidden />
            {trial?.positions.length > 0 ? t.trials.positionsWanted : t.trials.aboutThisTrial}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {trial?.positions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {trial?.positions.map((position) => (
                <Badge key={position} variant="neutral" className="font-mono">
                  {position}
                </Badge>
              ))}
            </div>
          )}
          {trial?.requirements && (
            <div>
              <h2 className="mb-1 text-sm font-medium">{t.trials.whatToBring}</h2>
              <p className="text-muted text-sm">{trial?.requirements}</p>
            </div>
          )}

          {/* The academy's note, rendered through the one component allowed to
              hand HTML to the DOM — see TrialNote for what guards it. */}
          {trial?.note && (
            <div>
              <h2 className="mb-1 text-sm font-medium">{t.notes.playerNote}</h2>
              <TrialNote html={trial?.note} />
            </div>
          )}
        </CardContent>
      </Card>

      {hosts ? (
        <>
          <TrialAdmin trial={trial} />
          <TrialStaff trial={trial} academyId={trial?.academyId} />
          <Applicants trial={trial} />
        </>
      ) : works ? (
        /* A coach on this trial gets the sheet and the verdict, and nothing
           administrative — the staff list and the squad are the manager's. */
        <CoachSheet trial={trial} />
      ) : trial?.status === 'ARCHIVED' ? (
        /* Applying would be refused by the server, so the button is replaced by
           the reason rather than left to fail under the press. */
        <Alert tone="warning">{t.trials.closedToApplications}</Alert>
      ) : (
        <ApplyToTrialButton
          trialId={trial?.id}
          existingStatus={existing?.status ?? null}
          ageRange={
            trial?.ageRangeMin != null && trial?.ageRangeMax != null
              ? { min: trial?.ageRangeMin, max: trial?.ageRangeMax }
              : null
          }
          applyDeadline={trial?.applyDeadline}
        />
      )}
    </div>
  );
}
