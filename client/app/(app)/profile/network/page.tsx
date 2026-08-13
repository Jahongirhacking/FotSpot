import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { follows, users } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { Follow, FollowerEntry, ProfileSummary } from '@/lib/api/types';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { cn, initials } from '@/lib/utils';

export const metadata: Metadata = { title: 'Network' };

type Tab = 'following' | 'followers';

/**
 * Who you follow, and who follows you.
 *
 * ## Both lists name people now
 *
 * `?tab=followers` used to be read and thrown away: there was a follower *count*
 * and no list behind it, and the following list printed the first eight
 * characters of a uuid where a name belongs, because a `Follow` row stores only a
 * type and an id. The API resolves both ends now, so every row has a name, a face
 * and somewhere to go.
 *
 * ## The two sides are not the same shape, and the page says so
 *
 * A follow points at a *player card* or an *academy*, so "following" is a list of
 * things. "Followers" is a list of accounts — people following your card, plus
 * academies following you as a scout (§1.5.2), added together exactly as the
 * counter above them adds them.
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
  const { tab } = await searchParams;
  const active: Tab = tab === 'followers' ? 'followers' : 'following';

  const opts = { token: session?.accessToken, cache: 'no-store' as const };

  /*
   * Both lists are fetched whichever tab is open, so switching is instant and the
   * counters are never a tab behind their own list. They are two small queries
   * against rows this account already owns; a saved round trip is not worth a
   * number that disagrees with the list under it.
   */
  const [summary, following, followers] = await Promise.all([
    users?.summary(opts).catch(() => null as ProfileSummary | null),
    follows
      .listMine({}, opts)
      .then((page) => page.items)
      .catch(() => [] as Follow[]),
    follows
      .followers(opts)
      .then((page) => page.items)
      .catch(() => [] as FollowerEntry[]),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-bold">{t.profile.network}</h1>
        <p className="text-muted text-sm">{t.profile.networkHint}</p>
      </header>

      {/* The counters are the tabs. Two cards showing numbers, with a third
          control to switch between them, would be three things saying two. */}
      <div className="grid grid-cols-2 gap-3">
        <TabCard
          href="/profile/network?tab=followers"
          active={active === 'followers'}
          count={summary?.followers ?? followers.length}
          label={t.profile.followers}
        />
        <TabCard
          href="/profile/network?tab=following"
          active={active === 'following'}
          count={summary?.following ?? following.length}
          label={t.profile.following}
        />
      </div>

      <Card>
        <CardContent className="p-2">
          {active === 'followers' ? (
            followers.length === 0 ? (
              <EmptyState
                icon={Users}
                title={t.profile.noFollowersTitle}
                description={t.profile.noFollowersBody}
              />
            ) : (
              <ul className="divide-border divide-y">
                {followers.map((row) => (
                  <li key={row?.id}>
                    <PersonRow
                      /*
                       * A follower is an *account*, and `/players/:id` wants a
                       * player profile id — a different thing, which is why the
                       * API sends both. Somebody who never built a card has
                       * nowhere public to go, so their name is plain text rather
                       * than a link to a 404.
                       */
                      href={
                        row?.kind === 'ACADEMY'
                          ? row?.academyId
                            ? `/academies/${row?.academyId}`
                            : null
                          : row?.profileId
                            ? `/players/${row?.profileId}`
                            : null
                      }
                      name={row?.name}
                      username={row?.username}
                      avatarUrl={row?.avatarUrl}
                      badge={row?.kind === 'ACADEMY' ? t.nav.academies : t.roles.player}
                      fallback={t.profile.followers}
                    />
                  </li>
                ))}
              </ul>
            )
          ) : following.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t.profile.notFollowingTitle}
              description={t.profile.notFollowingBody}
            />
          ) : (
            <ul className="divide-border divide-y">
              {following.map((row) => (
                <li key={row?.id}>
                  <PersonRow
                    href={
                      row?.targetType === 'PLAYER'
                        ? `/players/${row?.targetId}`
                        : `/academies/${row?.targetId}`
                    }
                    name={row?.name}
                    username={row?.username}
                    avatarUrl={row?.avatarUrl}
                    badge={row?.targetType === 'PLAYER' ? t.roles.player : t.nav.academies}
                    fallback={t.profile.following}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TabCard({
  href,
  active,
  count,
  label,
}: {
  href: string;
  active: boolean;
  count: number;
  label: string;
}) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}>
      <Card
        className={cn(
          'transition-colors',
          active ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
        )}
      >
        <CardContent className="p-4 text-center">
          <p className="text-2xl font-bold tabular-nums">{count}</p>
          <p className={cn('text-sm', active ? 'text-primary font-medium' : 'text-muted')}>
            {label}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * One row: face, name, and a link if there is somewhere to send the reader.
 *
 * A row whose target was deleted, or whose account has no handle to resolve, is
 * rendered as plain text rather than a link to a 404. It keeps its place because
 * dropping it would make the list shorter than the counter above it.
 */
function PersonRow({
  href,
  name,
  username,
  avatarUrl,
  badge,
  fallback,
}: {
  href: string | null;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  badge: string;
  fallback: string;
}) {
  const body = (
    <>
      <Avatar
        src={avatarUrl}
        fallback={initials(...(name ?? fallback).split(' '))}
        className="size-9"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name ?? fallback}</span>
        {username && <span className="text-muted block truncate text-xs">@{username}</span>}
      </span>
      <Badge variant="neutral">{badge}</Badge>
    </>
  );

  const shared = 'flex items-center gap-3 rounded-lg p-2';
  return href ? (
    <Link href={href} className={cn(shared, 'hover:bg-surface-2 transition-colors')}>
      {body}
    </Link>
  ) : (
    <div className={shared}>{body}</div>
  );
}
