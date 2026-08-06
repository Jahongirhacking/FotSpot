import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, ClipboardList, MapPin } from 'lucide-react';
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
import { TrialAdmin } from './TrialAdmin';
import { formatDate } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const trial = await trials.getById(id, { revalidate: 300 });
    return { title: trial.title };
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
    trial = await trials.getById(
      id,
      session ? { token: session.accessToken, cache: 'no-store' } : { revalidate: 300 },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const applications = session
    ? await trials.myApplications({ token: session.accessToken, cache: 'no-store' }).catch(() => [])
    : [];

  const existing = applications.find((application) => application.trialId === id);

  /*
   * The hosting academy sees who applied; everyone else sees the apply button.
   * Resolved from the caller's relation to *this* academy rather than from their
   * role, so an academy manager reading another academy's trial is a candidate's
   * view, not a manager's.
   */
  const [academy, relation] = await Promise.all([
    academies.getById(trial.academyId, { revalidate: 300 }).catch(() => null),
    session
      ? academies
          .relation(trial.academyId, { token: session.accessToken, cache: 'no-store' })
          .catch(() => null)
      : null,
  ]);
  const hosts = relation?.relation === 'MANAGER';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="primary">
            {t.trials.ages} {trial.ageRangeMin}–{trial.ageRangeMax}
          </Badge>
          {trial.status === 'ARCHIVED' && (
            <Badge variant="neutral">{t.trials.statusArchived}</Badge>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{trial.title}</h1>
        <dl className="text-muted mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-4" aria-hidden />
            <dt className="sr-only">{t.trials.date}</dt>
            <dd>{formatDate(trial.date)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden />
            <dt className="sr-only">{t.trials.location}</dt>
            <dd>{trial.location}</dd>
          </div>
        </dl>
        <p className="text-muted mt-2 text-sm">
          {t.academy.hostedBy}{' '}
          <Link href={`/academies/${trial.academyId}`} className="text-primary hover:underline">
            {academy?.name ?? t.nav.academies}
          </Link>
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="text-primary size-4" aria-hidden /> {t.trials.positionsWanted}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {trial.positions.map((position) => (
              <Badge key={position} variant="neutral" className="font-mono">
                {position}
              </Badge>
            ))}
          </div>
          {trial.requirements && (
            <div>
              <h2 className="mb-1 text-sm font-medium">{t.trials.whatToBring}</h2>
              <p className="text-muted text-sm">{trial.requirements}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {hosts ? (
        <>
          <TrialAdmin trial={trial} />
          <Applicants trialId={trial.id} />
        </>
      ) : trial.status === 'ARCHIVED' ? (
        /* Applying would be refused by the server, so the button is replaced by
           the reason rather than left to fail under the press. */
        <Alert tone="warning">{t.trials.closedToApplications}</Alert>
      ) : (
        <ApplyToTrialButton
          trialId={trial.id}
          existingStatus={existing?.status ?? null}
          ageRange={{ min: trial.ageRangeMin, max: trial.ageRangeMax }}
        />
      )}
    </div>
  );
}
