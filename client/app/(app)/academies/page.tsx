import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, MapPin } from 'lucide-react';
import { academies } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { isAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';

export const metadata: Metadata = { title: 'Academies' };

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
      session ? { token: session.accessToken, cache: 'no-store' } : { revalidate: 300 },
    )
    .catch(() => []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t.nav.academies}</h1>
          <p className="text-muted text-sm">{t.common.tagline}</p>
        </div>
        {isAdmin && (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/academies">{t.academy.manageAcademies}</Link>
          </Button>
        )}
      </header>

      {list.length === 0 ? (
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
          {list.map((academy) => (
            <li key={academy.id}>
              <Card className="hover:border-primary/40 h-full transition-colors">
                <Link href={`/academies/${academy.id}`} className="block">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="bg-primary/12 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                        <Building2 className="size-5" aria-hidden />
                      </div>
                      {academy.status === 'VERIFIED' && <Badge variant="success">{t.profile.verified}</Badge>}
                    </div>
                    <p className="mt-3 font-semibold">{academy.name}</p>
                    <p className="text-muted mt-0.5 flex items-center gap-1 text-xs">
                      <MapPin className="size-3" aria-hidden />
                      {academy.region ?? 'Uzbekistan'}
                      {academy.district ? ` · ${academy.district}` : ''}
                    </p>
                    {academy.description && (
                      <p className="text-muted mt-2 line-clamp-2 text-sm">{academy.description}</p>
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
