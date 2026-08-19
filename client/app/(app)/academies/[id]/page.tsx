import { AcademyFeaturedList } from '@/components/academy/AcademyFeaturedList';
import { AcademyFollowButton } from '@/components/academy/AcademyFollowButton';
import { AcademyGallery } from '@/components/academy/AcademyGallery';
import { AcademyMap } from '@/components/academy/AcademyMap';
import { AcademySocialLinks } from '@/components/academy/AcademySocialLinks';
import { RelationBadge } from '@/components/shared/RelationBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ApiError } from '@/lib/api/client';
import { academies, academyRoster, trials } from '@/lib/api/resources';
import type {
  AcademyFeatured,
  AcademyMember,
  AcademyPhoto,
  AcademyProfile,
  Trial,
} from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n';
import { getServerT } from '@/lib/i18n/server';
import { locationText, yandexMapsUrl } from '@/lib/maps';
import { absoluteUrl, jsonLd } from '@/lib/seo';
import { getSession } from '@/lib/session';
import { formatDate } from '@/lib/utils';
import {
  Building2,
  CalendarDays,
  ExternalLink,
  Images,
  MapPin,
  Pencil,
  Phone,
  Trophy,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type * as React from 'react';
import { AcademyProfileEditor } from './AcademyProfileEditor';

/**
 * The academy's own details, as the tab title and the share card.
 *
 * A bare name was all this said, so a link pasted into Telegram — which is where
 * these get shared here — unfurled as the site name and nothing else. Somebody
 * deciding whether to open it learned nothing about which academy it was.
 *
 * `revalidate` rather than no-store: this runs for crawlers and link unfurlers
 * as much as for readers, and neither needs the description to be seconds old.
 * The same call is cached for the page below it, so the pair costs one request.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  let academy: AcademyProfile;
  try {
    academy = await academies.getById(id, { revalidate: 300 });
  } catch {
    // A deleted or private academy still needs a title; the page itself will
    // 404 a moment later.
    return { title: 'Academy' };
  }

  const url = absoluteUrl(`/academies/${id}`);
  const where = locationText({ region: academy?.region, district: academy?.district });
  const isLocalTeam = academy?.kind === 'LOCAL_TEAM';

  /*
   * The description falls back rather than going missing.
   *
   * An academy that has not written one is the common case early on, and an
   * unfurl with no text at all reads as a broken link. Name plus place is
   * always true and is the pair somebody actually needs to recognise it.
   */
  const summary =
    academy?.description?.trim() ||
    [academy?.name, where].filter(Boolean).join(' · ') ||
    academy?.name;

  return {
    title: academy?.name,
    description: summary,
    alternates: { canonical: url },
    openGraph: {
      type: 'profile',
      url,
      title: academy?.name,
      description: summary,
      // The logo is the only image these records have; without it the card is
      // a grey rectangle with the site's default.
      ...(academy?.logoUrl
        ? { images: [{ url: academy.logoUrl, alt: academy?.name }] }
        : { images: [{ url: '/fotspot.png', alt: academy?.name }] }),
    },
    twitter: {
      card: 'summary',
      title: academy?.name,
      description: summary,
      ...(academy?.logoUrl ? { images: [academy.logoUrl] } : { images: ['/fotspot.png'] }),
    },
    // A local team is deliberately absent from the public directory (§13), so
    // it should not be in an index either — being unlisted and being
    //search-indexable are the same decision made twice.
    robots: isLocalTeam ? { index: false, follow: true } : { index: true, follow: true },
  };
}

/**
 * The academy, as everybody sees it — and as its manager edits it.
 *
 * ## Preview is the default, including for the manager
 *
 * The editor used to hang off the bottom of this page permanently, so a manager
 * opening their own academy got the profile followed by five forms and no way to
 * see what a parent sees. Now `?edit=1` is the whole difference: without it the
 * manager reads the same page as everyone else with a "Tahrirlash" button on it.
 *
 * The mode lives in the URL rather than in component state because that is what
 * makes the back button close the editor, a refresh keep it open, and "here,
 * look at this" a link somebody can send. It also means the server renders the
 * right thing on the first paint instead of flashing preview and then swapping.
 *
 * `edit=1` from a non-manager is ignored rather than refused — `isManager` gates
 * it here, and every route the editor calls checks ownership again server-side.
 * A guessed query parameter should do nothing, not produce an error page.
 */
export default async function AcademyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;
  const session = await getSession();

  let academy: AcademyProfile;
  try {
    academy = await academies.getById(
      id,
      session ? { token: session?.accessToken, cache: 'no-store' } : { revalidate: 300 },
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
          token: session?.accessToken,
          activeRole: session?.activeRole,
          cache: 'no-store',
        })
        .then((result) => result?.relation)
        .catch(() => null)
    : null;

  /*
   * Everything the manager publishes, fetched for everybody who opens the page.
   *
   * In parallel, and each failing to an empty list on its own: these are three
   * independent parts of a profile, and an academy whose gallery request fails
   * should still show its trials rather than an error page. Both endpoints are
   * @Public() on the API, so a guest sees the same profile a member does.
   *
   * Cached for guests, fresh for anybody signed in — the same split the trials
   * list already uses. The manager edits this page *on* this page, and a five
   * minute cache would mean uploading a photo and being shown the gallery
   * without it, which reads as the upload having failed.
   */
  const fresh = session
    ? { token: session?.accessToken, cache: 'no-store' as const }
    : { revalidate: 300 };

  const [academyTrials, photos, featured] = await Promise.all([
    trials.listForAcademy(id, fresh).catch(() => [] as Trial[]),
    academies.photos(id, fresh).catch(() => [] as AcademyPhoto[]),
    academies.featured(id, fresh).catch(() => [] as AcademyFeatured[]),
  ]);

  /*
   * The roster is fetched only for the manager, because it is what the featured
   * pickers choose from — a visitor has no use for it and should not pay for the
   * request.
   */
  const isManager = relation === 'MANAGER';
  const editing = isManager && edit === '1';
  const roster =
    isManager && editing
      ? await academyRoster
          .list(id, {}, { token: session!.accessToken, cache: 'no-store' })
          .catch(() => [] as AcademyMember[])
      : [];

  const featuredBy = (role: AcademyFeatured['role']) =>
    featured?.filter((person) => person?.role === role) ?? [];
  const players = featuredBy('PLAYER');
  const coaches = featuredBy('COACH');
  const scouts = featuredBy('SCOUT');
  const hasFeatured = players.length + coaches.length + scouts.length > 0;

  const located = typeof academy?.latitude === 'number' && typeof academy?.longitude === 'number';

  /*
   * A local team holds no trials, so the page has no trials card.
   *
   * Hidden rather than shown empty: "No trials right now" is true of an academy
   * between trials and misleading about an organisation that will never hold
   * any — it reads as "check back later". `TrialsService.create` refuses one
   * regardless; this is about not describing something that cannot happen.
   */
  const isLocalTeam = academy?.kind === 'LOCAL_TEAM';

  /** Whichever of the four the academy actually linked — `sameAs` wants URLs. */
  const socialLinks = [
    academy?.telegramUrl,
    academy?.facebookUrl,
    academy?.instagramUrl,
    academy?.youtubeUrl,
  ].filter((link): link is string => Boolean(link));

  /*
   * Where it is, in words and as a link.
   *
   * The words fall back to the country because a profile with no region still
   * has to say something under its name; the link does not fall back at all,
   * since "Uzbekistan" as a map search is a country outline rather than a
   * destination, and a link that answers nothing is worse than plain text.
   */
  const whereText = `${academy?.region ?? 'Uzbekistan'}${academy?.district ? ` · ${academy?.district}` : ''}`;
  const mapsHref = yandexMapsUrl({
    latitude: academy?.latitude,
    longitude: academy?.longitude,
    address: academy?.region
      ? locationText({ name: academy?.name, region: academy?.region, district: academy?.district })
      : null,
  });

  /*
   * Following is a player's action, and only on an academy.
   *
   * It exists to make trial announcements arrive, and `announceToMatchingPlayers`
   * only ever looks at players — a coach who followed would be writing a row
   * nothing reads. Guests see it too and are sent to sign in, the same trade the
   * player profile makes: hiding the reason to make an account from exactly the
   * people who have not made one is the wrong way round.
   *
   * Never on a local team. `TrialsService.create` refuses one a trial, so the
   * announcement this button subscribes to cannot ever be written — the button
   * would be a promise the product has no way of keeping, and the player would
   * be left waiting for a notification rather than checking the team's page.
   * This is the same reason the trials card is absent from a local team above.
   */
  const canFollowForTrials = !isLocalTeam && (!session || session?.activeRole === 'player');

  /*
   * The same facts, in the form a crawler reads as data rather than prose.
   *
   * `SportsOrganization` is the closest schema.org type — it is what lets a
   * result show the address and the phone under the name instead of a bare blue
   * link. Only fields the academy has actually filled in are emitted: a
   * `telephone` of null is worse than no telephone, being a claim that fails
   * validation rather than a detail left out.
   */
  const structuredData = {
    '@type': 'SportsOrganization',
    name: academy?.name,
    url: absoluteUrl(`/academies/${id}`),
    sport: 'Football',
    ...(academy?.description ? { description: academy.description } : {}),
    ...(academy?.logoUrl ? { logo: academy.logoUrl } : {}),
    ...(academy?.primaryPhone ? { telephone: academy.primaryPhone } : {}),
    ...(academy?.region
      ? {
          address: {
            '@type': 'PostalAddress',
            addressCountry: 'UZ',
            addressRegion: academy.region,
            ...(academy?.district ? { addressLocality: academy.district } : {}),
          },
        }
      : {}),
    ...(located
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: academy?.latitude,
            longitude: academy?.longitude,
          },
        }
      : {}),
    ...(socialLinks.length > 0 ? { sameAs: socialLinks } : {}),
  };

  return (
    <div className="space-y-6">
      {/* Not rendered to the reader — the machine-readable copy of what the page
          already says, so the two cannot disagree. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structuredData)} />

      {/* ---------- Identity ---------- */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {academy?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- bucket asset; next/image would add a loader for no gain
            <img
              src={academy?.logoUrl}
              alt=""
              className="border-border size-16 shrink-0 rounded-2xl border object-cover sm:size-20"
            />
          ) : (
            <div className="bg-primary/12 text-primary grid size-16 shrink-0 place-items-center rounded-2xl sm:size-20">
              <Building2 className="size-8" aria-hidden />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold break-words sm:text-2xl">{academy?.name}</h1>
              <RelationBadge relation={relation} kind={academy?.kind} t={t} />
            </div>

            {/* The place, and a way to get there.
                A region name is something to read; a link is something to act
                on, and every academy here is somewhere a family has to drive to
                on a Saturday. Coordinates when the manager set a pin, the
                written location when they have not — see lib/maps.ts. */}
            {mapsHref ? (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted hover:text-primary mt-1 flex items-center gap-1 text-sm hover:underline"
              >
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{whereText}</span>
                <ExternalLink className="size-3 shrink-0" aria-hidden />
              </a>
            ) : (
              <p className="text-muted mt-1 flex items-center gap-1 text-sm">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{whereText}</span>
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* What this organisation *is* comes before whether it was checked.
                  A local team is not an academy waiting to be verified — it is a
                  different thing that never gets verified — so giving it the
                  verification badge would answer a question nobody asked and
                  imply a promotion that does not exist (§20). */}
              {isLocalTeam ? (
                <Badge variant="neutral">{t.academy?.localTeam}</Badge>
              ) : academy?.status === 'VERIFIED' ? (
                <Badge variant="success">{t.academy?.verifiedAcademy}</Badge>
              ) : (
                <Badge variant="warning">{t.academy?.awaitingVerification}</Badge>
              )}
              <span className="text-muted text-xs">
                {t.academy?.membersCount?.replace('{count}', String(academy?.members?.length ?? 0))}
              </span>
            </div>
          </div>
        </div>

        {/* What this viewer can do here, above the links they might follow away
            on. Exactly one of these ever renders: the manager edits, a player
            subscribes, and nobody does both. */}
        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          {isManager && !editing && (
            <Button asChild>
              <Link href={`/academies/${id}?edit=1`}>
                <Pencil aria-hidden /> {t.common?.edit}
              </Link>
            </Button>
          )}

          {!isManager && canFollowForTrials && (
            <AcademyFollowButton
              academyId={id}
              isAuthenticated={Boolean(session)}
              loginHref={`/login?next=${encodeURIComponent(`/academies/${id}`)}`}
              className="sm:text-right"
            />
          )}

          <AcademySocialLinks academy={academy} />
        </div>
      </header>

      {/* ---------- Editing ----------
          Replaces the profile rather than sitting under it: a manager who
          pressed edit is editing, and leaving the read-only copy above the forms
          gives them two versions of the same fields to compare. */}
      {editing && (
        <AcademyProfileEditor academy={academy} members={roster} backHref={`/academies/${id}`} />
      )}

      {!editing && (
        <>
          {academy?.description && (
            <Card>
              <CardContent className="p-5 text-sm leading-relaxed">
                {academy?.description}
              </CardContent>
            </Card>
          )}

          <AcademyContactCard academy={academy} t={t} />

          {/* ---------- Gallery ---------- */}
          {photos?.length > 0 && (
            <Section
              icon={<Images className="text-primary size-4" aria-hidden />}
              title={t.academy?.galleryTitle}
            >
              <AcademyGallery photos={photos} />
            </Section>
          )}

          {/* ---------- Featured people ----------
          One card per role rather than three columns of a shared grid: the lists
          are 10, 5 and 3 long, so equal columns would leave two of them mostly
          white space on a wide screen. */}
          {hasFeatured && (
            <div className="grid gap-4 lg:grid-cols-2">
              <FeaturedCard
                className={
                  players.length > 0 && coaches.length + scouts.length > 0 ? 'lg:row-span-2' : ''
                }
                title={t.academy?.featuredPlayersTitle}
                people={players}
              />
              <FeaturedCard title={t.academy?.featuredCoachesTitle} people={coaches} />
              <FeaturedCard title={t.academy?.featuredScoutsTitle} people={scouts} />
            </div>
          )}

          {/* ---------- Trials, and where to find them ---------- */}
          <div
            className={isLocalTeam ? 'grid gap-6' : 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]'}
          >
            {!isLocalTeam && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays className="text-primary size-4" aria-hidden />{' '}
                    {t.trials?.openTrials}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {academyTrials?.length === 0 ? (
                    <p className="text-muted text-sm">{t.academy?.noTrialsNow}</p>
                  ) : (
                    <ul className="divide-border divide-y">
                      {academyTrials?.map((trial) => (
                        <li
                          key={trial?.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-3"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/trials/${trial?.id}`}
                              className="font-medium hover:underline"
                            >
                              {trial?.title}
                            </Link>
                            <p className="text-muted text-xs">
                              {formatDate(trial?.date)} · {trial?.location} · {trial?.ageRangeMin}–
                              {trial?.ageRangeMax}
                            </p>
                          </div>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/trials/${trial?.id}`}>{t.common?.open}</Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="space-y-4">
              {located && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MapPin className="text-primary size-4" aria-hidden />{' '}
                      {t.academy?.locationLabel}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AcademyMap
                      latitude={academy?.latitude}
                      longitude={academy?.longitude}
                      name={academy?.name}
                    />
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="text-primary size-4" aria-hidden /> {t.academy?.staffTitle}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted text-sm">{t.academy?.staffHint}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * How to ring the academy.
 *
 * A profile that can only be contacted by turning up is not much of a profile,
 * and the phone is what a parent uses before they drive anywhere. Rendered as
 * `tel:` links so a phone dials rather than making somebody copy digits between
 * apps, and skipped entirely when the academy has given neither number — an
 * empty "Contact" card advertises an absence.
 *
 * The backup is labelled as such rather than listed as a second equal number:
 * knowing which one to try first is most of the value of having two.
 */
function AcademyContactCard({ academy, t }: { academy: AcademyProfile; t: Dictionary }) {
  const numbers = [
    { label: t.academy?.primaryPhone, value: academy?.primaryPhone },
    { label: t.academy?.backupPhone, value: academy?.backupPhone },
  ].filter((entry) => Boolean(entry?.value));

  if (numbers.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="text-primary size-4" aria-hidden /> {t.academy?.contactTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-x-8 gap-y-3">
        {numbers.map((entry) => (
          <div key={entry?.label}>
            <p className="text-muted text-xs">{entry?.label}</p>
            <a href={`tel:${entry?.value}`} className="text-primary font-medium hover:underline">
              {entry?.value}
            </a>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** A titled block that is not a Card — used where the content carries its own frames. */
function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function FeaturedCard({
  title,
  people,
  className,
}: {
  title: string;
  people: AcademyFeatured[];
  className?: string;
}) {
  // An academy that featured players but no scouts should show one card, not a
  // card apologising for being empty.
  if (!people?.length) return null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="text-primary size-4" aria-hidden />
          {title}
          <span className="text-muted text-xs font-normal">{people?.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AcademyFeaturedList people={people} />
      </CardContent>
    </Card>
  );
}
