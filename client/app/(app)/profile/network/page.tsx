import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { follows, users } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { Follow, ProfileSummary } from '@/lib/api/types';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { initials } from '@/lib/utils';

export const metadata: Metadata = { title: 'Network' };

/**
 * Who you follow, and how many follow you.
 *
 * The two are not symmetrical, and the page says so rather than pretending: this
 * platform's follows point at a *player card* or an *academy*, so "following" is
 * a list of things, while "followers" is a count of accounts pointed at you.
 * Listing your followers by name would mean publishing who is watching a child,
 * which is not a list this product should hand out.
 *
 * NOTE (Next 16): `searchParams` is a Promise and must be awaited.
 */
export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login?next=/profile/network');
  const { t } = await getServerT();
  await searchParams;

  const opts = { token: session?.accessToken, cache: 'no-store' as const };
  const [summary, following] = await Promise.all([
    users?.summary(opts).catch(() => null as ProfileSummary | null),
    follows
      .listMine({}, opts)
      .then((page) => page.items)
      .catch(() => [] as Follow[]),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-bold">{t.profile.network}</h1>
        <p className="text-muted text-sm">{t.profile.networkHint}</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold tabular-nums">{summary?.followers ?? 0}</p>
            <p className="text-muted text-sm">{t.profile.followers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold tabular-nums">{summary?.following ?? 0}</p>
            <p className="text-muted text-sm">{t.profile.following}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.profile.following}</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          {following.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t.profile.notFollowingTitle}
              description={t.profile.notFollowingBody}
            />
          ) : (
            <ul className="divide-border divide-y">
              {following.map((row) => (
                <li key={row?.id}>
                  <Link
                    href={
                      row?.targetType === 'PLAYER'
                        ? `/players/${row?.targetId}`
                        : `/academies/${row?.targetId}`
                    }
                    className="hover:bg-surface-2 flex items-center gap-3 rounded-lg p-2"
                  >
                    <Avatar
                      src={null}
                      fallback={initials(row?.targetType[0], '')}
                      className="size-9"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {row?.targetId.slice(0, 8)}
                    </span>
                    <Badge variant="neutral">
                      {row?.targetType === 'PLAYER' ? t.roles.player : t.nav.academies}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
