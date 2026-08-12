import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type * as React from 'react';
import { Building2, CalendarDays, Images, MapPin, Trophy, Users } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { academies, academyRoster, trials } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import type {
  AcademyFeatured,
  AcademyMember,
  AcademyPhoto,
  AcademyProfile,
  Trial,
} from '@/lib/api/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getServerT } from '@/lib/i18n/server';
import { RelationBadge } from '@/components/shared/RelationBadge';
import { formatDate } from '@/lib/utils';
import { AcademyGallery } from '@/components/academy/AcademyGallery';
import { AcademyMap } from '@/components/academy/AcademyMap';
import { AcademySocialLinks } from '@/components/academy/AcademySocialLinks';
import { AcademyFeaturedList } from '@/components/academy/AcademyFeaturedList';
import { AcademyProfileEditor } from './AcademyProfileEditor';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const academy = await academies.getById(id, { revalidate: 300 });
    return { title: academy?.name };
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
  const roster = isManager
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

  return (
    <div className="space-y-6">
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
              <RelationBadge relation={relation} t={t} />
            </div>

            <p className="text-muted mt-1 flex items-center gap-1 text-sm">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">
                {academy?.region ?? 'Uzbekistan'}
                {academy?.district ? ` · ${academy?.district}` : ''}
              </span>
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {academy?.status === 'VERIFIED' ? (
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

        <AcademySocialLinks academy={academy} className="shrink-0" />
      </header>

      {academy?.description && (
        <Card>
          <CardContent className="p-5 text-sm leading-relaxed">{academy?.description}</CardContent>
        </Card>
      )}

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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="text-primary size-4" aria-hidden /> {t.trials?.openTrials}
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
                      <Link href={`/trials/${trial?.id}`} className="font-medium hover:underline">
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

        <div className="space-y-4">
          {located && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="text-primary size-4" aria-hidden /> {t.academy?.locationLabel}
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
