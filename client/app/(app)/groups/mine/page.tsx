import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { groups } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import type { GroupDetail } from '@/lib/api/types';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { ageBand, initials } from '@/lib/utils';

export const metadata: Metadata = { title: 'My group' };

/**
 * The squad a coach has been given.
 *
 * Read-only: a coach works with the group they are given, and the manager cuts
 * the squads (§1.10). What a coach does with these players is assess them, which
 * happens on the player's own page — so every row here is a link there rather
 * than a control.
 */
export default async function MyGroupPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/groups/mine');
  const { t } = await getServerT();

  const mine = await groups
    .mine({ token: session.accessToken, cache: 'no-store' })
    .catch(() => [] as GroupDetail[]);

  if (mine.length === 0) {
    return (
      <EmptyState icon={Users} title={t.academy.noGroupTitle} description={t.academy.noGroupBody} />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {mine.map((group) => (
        <Card key={group.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{group.name}</CardTitle>
            <p className="text-muted text-sm">
              {group.academy.name}
              {group.description ? ` · ${group.description}` : ''}
            </p>
          </CardHeader>
          <CardContent className="p-2">
            {group.members.length === 0 ? (
              <EmptyState icon={Users} title={t.academy.groupEmpty} />
            ) : (
              <ul className="divide-border divide-y">
                {group.members.map((member) => (
                  <li key={member.id}>
                    <Link
                      href={member.playerId ? `/players/${member.playerId}` : '#'}
                      className="hover:bg-surface-2 flex items-center gap-3 rounded-lg p-2"
                    >
                      <Avatar
                        src={member.avatarUrl}
                        fallback={initials(member.firstName ?? '', member.lastName ?? '')}
                        className="size-9"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {[member.firstName, member.lastName].filter(Boolean).join(' ') ||
                            member.username}
                        </span>
                        <span className="text-muted block truncate text-xs">
                          {[member.primaryPosition, member.birthDate && ageBand(member.birthDate)]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {member.role !== 'PLAYER' && (
                        <Badge variant="neutral">
                          {t.roles[member.role.toLowerCase() as 'coach']}
                        </Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
