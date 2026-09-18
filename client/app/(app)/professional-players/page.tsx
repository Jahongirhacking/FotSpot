import { Button } from '@/components/ui/Button';
import { professionalPlayers } from '@/lib/api/resources';
import { getServerT } from '@/lib/i18n/server';
import { isAdminActing } from '@/lib/roles';
import { hasUiOnlyQuery } from '@/lib/player-url';
import { pageMetadata } from '@/lib/seo';
import { getSession } from '@/lib/session';
import { Settings2, Star } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PROFESSIONAL_PAGE_SIZE, ProfessionalPlayerDirectory } from './ProfessionalPlayerDirectory';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { t } = await getServerT();
  return pageMetadata({
    path: '/professional-players',
    title: `${t.professional.title} — FotSpot`,
    description: t.professional.subtitle,
    // `?player=<id>` is a card open over the directory, not a page of its own.
    index: !hasUiOnlyQuery(await searchParams),
  });
}

/**
 * The professionals directory — README §21.
 *
 * Public and reachable, but on no menu: a reader arrives from an academy's
 * page ("came through here") or from a link, not by browsing for it. Admins
 * get the way to the console from here, since the console is where the list
 * is written.
 */
export default async function ProfessionalPlayersPage() {
  const [{ t }, session] = await Promise.all([getServerT(), getSession()]);
  const first = await professionalPlayers
    .list({ pageSize: PROFESSIONAL_PAGE_SIZE }, { revalidate: 120 })
    .catch(() => null);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Star className="text-primary size-5" aria-hidden /> {t.professional.title}
          </h1>
          <p className="text-muted text-sm">{t.professional.subtitle}</p>
        </div>
        {isAdminActing(session?.activeRole ?? null) && (
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/professional-players">
              <Settings2 aria-hidden /> {t.professional.manage}
            </Link>
          </Button>
        )}
      </header>

      <ProfessionalPlayerDirectory initial={first} />
    </div>
  );
}
