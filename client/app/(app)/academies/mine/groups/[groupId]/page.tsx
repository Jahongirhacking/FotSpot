import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { academyRoster, groups } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import type { AcademyGroup, AcademyMember } from '@/lib/api/types';
import { GroupDetailManager } from './GroupDetailManager';

export const metadata: Metadata = { title: 'Group' };

/**
 * One squad, and the only place it can be renamed or dissolved.
 */
export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/academies/mine/groups/${groupId}`);

  const opts = { token: session.accessToken, cache: 'no-store' as const };
  const group = await groups.getById(groupId, opts).catch(() => null);
  if (!group) notFound();

  const [members, list] = await Promise.all([
    academyRoster.list(group.academy.id, {}, opts).catch(() => [] as AcademyMember[]),
    groups
      .list(group.academy.id, opts)
      .catch(() => ({ groups: [] as AcademyGroup[], reserveCount: 0 })),
  ]);

  return (
    <GroupDetailManager initialGroup={group} initialMembers={members} initialGroups={list.groups} />
  );
}
