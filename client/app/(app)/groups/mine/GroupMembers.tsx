'use client';

import type { GroupDetail } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { MemberSections } from '@/components/academy/MemberRows';

/** The coach's read-only view of their squad, split the same way the manager's is. */
export function GroupMembers({ members }: { members: GroupDetail['members'] }) {
  const { t } = useI18n();
  return <MemberSections members={members} emptyLabel={t.academy.groupEmpty} />;
}
