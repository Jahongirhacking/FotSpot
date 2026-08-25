import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2, CalendarDays, ClipboardList, Clock, Hourglass, MapPin } from 'lucide-react';
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
import { formatTrialDates, formatTrialTimes } from '@/lib/trial-window';
import { absoluteUrl, jsonLd, seoKeywords } from '@/lib/seo';
import { breadcrumbLd, trialEventLd } from '@/lib/structured-data';
import { LoadingImage } from '@/components/ui/LoadingImage';
import { locationText, yandexMapsUrl } from '@/lib/maps';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { t } = await getServerT();

  let trial: Trial;
  try {
    trial = await trials?.getById(id, { revalidate: 300 });
  } catch {
    // The page itself 404s a moment later; a title is still needed for the tab.
    return { title: t.nav.trials };
  }

  const url = absoluteUrl(`/trials/${id}`);
  const host = trial?.academy?.name;
  const when = formatTrialDates(trial, t.trials.openEnded);

  /*
   * A description built from what the trial actually says.
   *
   * Host, place and dates are the three facts somebody scanning a search result
   * needs to decide whether it is for them, and every trial has all three (the
   * dates fall back to "open-ended", which is itself the answer). The academy's
   * own note is deliberately not used: it is HTML, written for a player who has
   * already opened the page, and it is often long.
   */
  const summary = [host, trial?.location, when].filter(Boolean).join(' · ');

  return {
    title: trial?.title,
    description: summary,
    keywords: seoKeywords(trial?.seoKeywords, [trial?.title, host, trial?.location]),
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title: trial?.title,
      description: summary,
      // The cover when there is one; the site default otherwise, which the root
      // layout already supplies. An unfurl with a broken image is worse than one
      // with the site's own.
      ...(trial?.coverUrl ? { images: [{ url: trial.coverUrl }] } : {}),
    },
  };
}

export default async function TrialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const { t, f } = await getServerT();

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

  /*
   * Only a player has applications, so only a player is asked for them.
   *
   * Gated on the active role rather than on merely having a session: the
   * endpoint refuses anyone without a player profile, and asking regardless
   * meant a manager opening one of their own trials logged a 403 every time.
   * The `.catch` hid it from the page, which is why it went unnoticed — the only
   * trace was a WARN on the server for a question that should not be asked.
   *
   * The active role, not the presence of a profile, for the same reason the
   * manager's trial form is: somebody who coaches and also plays sees the screen
   * belonging to the hat they are wearing (§1.2.1).
   */
  const applications =
    session?.activeRole === 'player'
      ? await trials
          ?.myApplications({ token: session?.accessToken, cache: 'no-store' })
          .catch(() => [])
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
     *
     * Asked of anybody signed in, not only somebody wearing the coach hat.
     * Working a session is an *assignment* — a `TrialCoach` row the manager
     * created — and it does not stop being true because the person is currently
     * reading the site as a manager. A small academy's manager is often the
     * coach on the pitch, and gating this on the active role meant the one
     * person who was going to test the players had no way to record a verdict
     * and no hat to switch to that would show them this trial.
     */
    session
      ? trials?.myCoaching({ token: session?.accessToken, cache: 'no-store' }).catch(() => [])
      : [],
  ]);
  const hosts = relation?.relation === 'MANAGER';
  const works = coaching?.some((assigned) => assigned.id === id);

  /*
   * A link only when the academy has said where it is, in coordinates.
   *
   * `yandexMapsUrl` is given no `address` on purpose: with one it falls back to
   * a *text search*, which is right on the academy's own profile but not here —
   * a player tapping a location on a trial expects the pin, and a search for a
   * district name opens a map of somewhere approximate. No coordinates, no link,
   * and the place is still named in plain text below.
   */
  const mapsHref = academy
    ? yandexMapsUrl({ latitude: academy?.latitude, longitude: academy?.longitude })
    : null;
  // The academy's own place, not the session's — those differ, and both are on
  // this page. Name deliberately omitted: it is already the heading above this.
  const dailyTimes = formatTrialTimes(trial);
  const where = locationText({ region: academy?.region, district: academy?.district });

  /*
   * A trial is an event, and Google shows events as a date-and-venue card
   * rather than a blue link — which is the single biggest search win available
   * on this site, because it is the page a parent is actually looking for.
   *
   * `trialEventLd` answers null for a private, archived or open-ended trial and
   * the block simply is not rendered; see its own note for why each of those is
   * a refusal rather than a gap to fill in.
   */
  const event = trialEventLd(trial);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {event && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(event)} />}
      {/* The trail a result shows instead of the raw URL. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbLd([
            { name: t.nav.trials, path: '/trials' },
            { name: trial?.title, path: `/trials/${id}` },
          ]),
        )}
      />
      {/*
        The cover, above everything.
        `aspect-[3/1]` rather than the card's 16:9 — a banner at the top of a
        page reads as a header, where a 16:9 block reads as a photograph the
        reader is meant to study.
      */}
      {trial?.coverUrl && (
        <div className="bg-surface-2 relative aspect-[3/1] w-full overflow-hidden rounded-xl">
          <LoadingImage
            src={trial.coverUrl}
            alt={f(t.trials.coverAlt, { title: trial?.title })}
            className="absolute inset-0 size-full object-cover"
          />
        </div>
      )}

      {/*
        Who is running it, and where they are — before the trial's own details.
        A player deciding whether to travel reads the club first; the session's
        own location is further down, and the two are genuinely different places
        (an academy in Tashkent can hold a trial in Chilonzor).
      */}
      {academy && (
        <div className="flex items-center gap-3">
          <Link
            href={`/academies/${academy.id}`}
            className="bg-surface-3 focus-visible:ring-ring relative size-12 shrink-0 overflow-hidden rounded-xl focus-visible:ring-2 focus-visible:outline-none"
            aria-label={academy.name}
          >
            {academy.logoUrl ? (
              <LoadingImage
                src={academy.logoUrl}
                alt=""
                spinner={false}
                className="size-full object-cover"
              />
            ) : (
              <span className="text-muted grid size-full place-items-center">
                <Building2 className="size-5" aria-hidden />
              </span>
            )}
          </Link>

          <div className="min-w-0">
            <Link href={`/academies/${academy.id}`} className="font-semibold hover:underline">
              {academy.name}
            </Link>
            {/* Nothing at all when the academy has named no place — an empty
                line with a pin on it says "unknown" more loudly than silence. */}
            {where &&
              (mapsHref ? (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted hover:text-foreground flex items-center gap-1.5 text-sm hover:underline"
                >
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{where}</span>
                  <span className="sr-only">({t.trials.openInMaps})</span>
                </a>
              ) : (
                <p className="text-muted flex items-center gap-1.5 text-sm">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{where}</span>
                </p>
              ))}
          </div>
        </div>
      )}

      <header>
        <div className="flex flex-wrap items-center gap-2">
          {/* A private trial states no age range: it is for one named child who
              was already chosen, so there is no rule to show them. */}
          {trial?.ageRangeMin != null && trial?.ageRangeMax != null && (
            <Badge variant="primary">
              {t.trials.ages} {trial?.ageRangeMin}–{trial?.ageRangeMax}
            </Badge>
          )}
          {/* Only when it says something: every trial carries a gender (the
              column is defaulted), so this is always shown — unlike the age
              range above, which a private trial genuinely does not state. */}
          <Badge variant="outline">
            {trial?.gender === 'female'
              ? t.trials.genderFemale
              : trial?.gender === 'general'
                ? t.trials.genderGeneral
                : t.trials.genderMale}
          </Badge>
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
            <dd>{formatTrialDates(trial, t.trials.openEnded)}</dd>
          </div>
          {/* The hours of each day, when the trial states them — a fortnight-long
              window that runs 09:00–18:00 is a different commitment from one
              that does not say, and the dates alone cannot carry it. */}
          {dailyTimes && (
            <div className="flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden />
              <dt className="sr-only">{t.trials.dailyWindow}</dt>
              <dd>{dailyTimes}</dd>
            </div>
          )}
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

      {/*
        The two roles are not exclusive, and this used to treat them as if they
        were. A small academy's manager is often also a coach on the session; the
        `hosts ? … : works ? …` chain gave them the administrative half and
        silently dropped the sheet, so the one person who was going to be on the
        pitch had no way to record a verdict.

        Each half now renders on its own condition. A manager gets the trial's
        administration; a coach working the session gets the sheet and the
        PASS/FAIL. Somebody who is both gets both, which is what they are.
      */}
      {hosts && (
        <>
          <TrialAdmin trial={trial} />
          <TrialStaff trial={trial} academyId={trial?.academyId} />
          <Applicants trial={trial} />
        </>
      )}

      {works && <CoachSheet trial={trial} />}

      {!hosts &&
        !works &&
        (trial?.status === 'ARCHIVED' ? (
          /* Applying would be refused by the server, so the button is replaced by
           the reason rather than left to fail under the press. */
          <Alert tone="warning">{t.trials.closedToApplications}</Alert>
        ) : (
          <ApplyToTrialButton
            trialId={trial?.id}
            existingStatus={existing?.status ?? null}
            applicationId={existing?.id ?? null}
            ageRange={
              trial?.ageRangeMin != null && trial?.ageRangeMax != null
                ? { min: trial?.ageRangeMin, max: trial?.ageRangeMax }
                : null
            }
            applyDeadline={trial?.applyDeadline}
          />
        ))}
    </div>
  );
}
