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
  /** A player on the academy's books — `AcademyMember.role` includes this. */
  | 'PLAYER'
  | 'ENDORSED_SCOUT'
  | 'ENDORSED_COACH'
  | 'TRIALIST'
  | 'MY_COACH';

export function RelationBadge({
  relation,
  t,
  className,
}: {
  /** Straight from `GET /academies/:id/relation`, so widened to string. */
  relation: Relation | string | null | undefined;
  t: Dictionary;
  className?: string;
}) {
  if (!relation) return null;

  /*
   * A value this component does not recognise renders nothing.
   *
   * `relation` is `AcademyMember.role` off the wire, and the union above is a
   * hopeful copy of an enum that lives in another package — it was missing
   * `PLAYER` from the day it was written, which nobody noticed until players
   * started joining academies and every one of them crashed this page. The
   * lookup returned undefined and destructuring it threw, taking the whole
   * profile down to an error boundary over a badge.
   *
   * So the badge is not the place to be strict. An unrecognised relation is a
   * missing decoration, not a broken page; the union still documents what is
   * expected and still type-checks call sites that pass a literal.
   */
  const described = describe(relation, t);
  if (!described) return null;

  const { label, icon: Icon } = described;

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

/** Undefined for anything unrecognised — see the note at the call site. */
function describe(relation: string, t: Dictionary) {
  switch (relation) {
    case 'SELF':
      return { label: t.relation?.you, icon: UserCircle };
    case 'MY_COACH':
      return { label: t.relation?.myCoach, icon: ClipboardCheck };
    // "My academy" rather than the role name: the badge answers "is this
    // mine?", and the role is already stated everywhere else on the page. True
    // of a player on its books as much as of the manager who runs it.
    case 'MANAGER':
    case 'COACH':
    case 'SCOUT':
    case 'PLAYER':
      return { label: t.relation?.myAcademy, icon: Building2 };
    case 'ENDORSED_SCOUT':
    case 'ENDORSED_COACH':
      return { label: t.relation?.endorsesMe, icon: BadgeCheck };
    case 'TRIALIST':
      return { label: t.relation?.acceptedMe, icon: BadgeCheck };
    default:
      return undefined;
  }
}
