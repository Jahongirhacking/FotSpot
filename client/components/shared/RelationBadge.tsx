import { BadgeCheck, Building2, ClipboardCheck, UserCircle } from 'lucide-react';
import type { Dictionary } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * "This one is yours."
 *
 * Marks the profile the viewer *is*, the academy they belong to, or the coach who
 * assessed them. The platform shows a lot of near-identical cards — twenty players
 * in a search, fifty academies in a directory — and without a marker the one that
 * matters personally reads exactly like the other forty-nine. It also stops a
 * manager wondering whether the academy they are looking at is the one they run.
 *
 * Visually distinct from the status badges beside it (verified, pending): those
 * describe the record, this describes the viewer's relationship to it.
 */
export type Relation =
  | 'SELF'
  | 'MANAGER'
  | 'COACH'
  | 'SCOUT'
  | 'ENDORSED_SCOUT'
  | 'ENDORSED_COACH'
  | 'TRIALIST'
  | 'MY_COACH';

export function RelationBadge({
  relation,
  t,
  className,
}: {
  relation: Relation | null | undefined;
  t: Dictionary;
  className?: string;
}) {
  if (!relation) return null;

  const { label, icon: Icon } = describe(relation, t);

  return (
    <span
      className={cn(
        'bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

function describe(relation: Relation, t: Dictionary) {
  switch (relation) {
    case 'SELF':
      return { label: t.relation.you, icon: UserCircle };
    case 'MY_COACH':
      return { label: t.relation.myCoach, icon: ClipboardCheck };
    case 'MANAGER':
      // "My academy" rather than "Manager": the badge answers "is this mine?",
      // and the role is already stated everywhere else on the page.
      return { label: t.relation.myAcademy, icon: Building2 };
    case 'COACH':
    case 'SCOUT':
      return { label: t.relation.myAcademy, icon: Building2 };
    case 'ENDORSED_SCOUT':
    case 'ENDORSED_COACH':
      return { label: t.relation.endorsesMe, icon: BadgeCheck };
    case 'TRIALIST':
      return { label: t.relation.acceptedMe, icon: BadgeCheck };
  }
}
