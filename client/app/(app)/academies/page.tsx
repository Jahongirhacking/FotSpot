import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { academies } from '@/lib/api/resources';
import { interpolate } from '@/lib/i18n';
import { getServerT } from '@/lib/i18n/server';
import { isAdminActing } from '@/lib/roles';
import { absoluteUrl, jsonLd } from '@/lib/seo';
import { getSession } from '@/lib/session';
import { Building2, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * The directory, described by what is actually in it.
 *
 * The title alone was translated and correct and told a search engine — or
 * anybody the link was pasted to — nothing about the page. Counting the
 * academies and naming a few regions is the shortest true summary available,
 * and it comes from the same request the page already makes.
 *
 * Public data only: `listPublic` is what an anonymous visitor sees, so nothing
 * here can leak a local team or an unverified record into a search result.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  const list = await academies?.listPublic(undefined, { revalidate: 300 }).catch(() => []);

  const regions = [...new Set(list.map((academy) => academy?.region).filter(Boolean))];
  const description = list.length
    ? interpolate(t.academy.directorySummary, {
        count: list.length,
        regions: regions.slice(0, 4).join(', '),
      })
    : t.academy.adminOnly;

  const url = absoluteUrl('/academies');

  return {
    title: t.nav.academies,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title: t.nav.academies,
      description,
      images: [
        {
          url: '/fotspot.png',
          width: 600,
          height: 600,
          alt: 'FotSpot',
        },
      ],
    },
    twitter: { card: 'summary', title: t.nav.academies, description, images: ['/fotspot.png'] },
    robots: { index: true, follow: true },
  };
}

export default async function AcademiesPage() {
  const session = await getSession();
  const { t } = await getServerT();

  // Academies are onboarded by the platform team, not self-registered — there are
  // only ~50 in the country. The console is where that happens; there is no
  // public registration form to link to.
  // The *acting* role, not every role held: an admin browsing as an academy
  // manager should see this page the way a manager does (§1.2.1).
  const isAdmin = isAdminActing(session?.activeRole ?? null);

  const list = await academies
    .listPublic(
      undefined,
      session ? { token: session?.accessToken, cache: 'no-store' } : { revalidate: 300 },
    )
    .catch(() => []);

  /*
   * The directory as an ordered list a crawler can read.
   *
   * `ItemList` is what makes these eligible to appear as a set rather than as
   * one page that happens to mention several names — each entry points at its
   * own profile, which is the page that carries the full `SportsOrganization`
   * record. Capped at the first twenty: this is a summary for a result, not a
   * second copy of the directory.
   */
  const structuredData = {
    '@type': 'ItemList',
    name: t.nav.academies,
    numberOfItems: list.length,
    itemListElement: list.slice(0, 20).map((academy, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(`/academies/${academy?.id}`),
      name: academy?.name,
    })),
  };

  return (
    <div className="space-y-6">
      {list.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structuredData)} />
      )}

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t.nav.academies}</h1>
          <p className="text-muted text-sm">{t.academy.subtitle}</p>
        </div>
        {isAdmin && (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/academies">{t.academy.manageAcademies}</Link>
          </Button>
        )}
      </header>

      {list?.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t.academy.noneListed}
          description={t.academy.adminOnly}
          action={
            isAdmin ? (
              <Button asChild>
                <Link href="/admin/academies">{t.admin.newAcademy}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list?.map((academy) => (
            <li key={academy?.id}>
              <Card className="hover:border-primary/40 h-full transition-colors">
                <Link href={`/academies/${academy?.id}`} className="block">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      {/* The logo is how somebody recognises an academy they
                          have already heard of, which a generic glyph on every
                          card cannot do. The glyph stays as the fallback: most
                          records have no logo yet, and an empty square would be
                          worse than the icon it replaced. */}
                      {academy?.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- bucket asset; next/image would add a loader for no gain
                        <img
                          src={academy?.logoUrl}
                          alt={academy?.name || 'Akademiya'}
                          loading="lazy"
                          className="border-border bg-surface size-10 shrink-0 rounded-xl border object-cover"
                        />
                      ) : (
                        <div className="bg-primary/12 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                          <Building2 className="size-5" aria-hidden />
                        </div>
                      )}
                      {academy?.status === 'VERIFIED' && (
                        <Badge variant="success">{t.profile.verified}</Badge>
                      )}
                    </div>
                    <p className="mt-3 font-semibold">{academy?.name}</p>
                    <p className="text-muted mt-0.5 flex items-center gap-1 text-xs">
                      <MapPin className="size-3" aria-hidden />
                      {academy?.region ?? 'Uzbekistan'}
                      {academy?.district ? ` · ${academy?.district}` : ''}
                    </p>
                    {academy?.description && (
                      <p className="text-muted mt-2 line-clamp-2 text-sm">{academy?.description}</p>
                    )}
                  </CardContent>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
