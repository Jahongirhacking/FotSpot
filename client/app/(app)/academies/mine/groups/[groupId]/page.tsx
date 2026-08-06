import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { groups } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
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

  const group = await groups
    .getById(groupId, { token: session.accessToken, cache: 'no-store' })
    .catch(() => null);

  if (!group) notFound();

  return <GroupDetailManager initialGroup={group} />;
}
