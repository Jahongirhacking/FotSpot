import Link from 'next/link';
import type { AcademyFeatured } from '@/lib/api/types';
import { Avatar } from '@/components/ui/Avatar';
import { initials } from '@/lib/utils';

/**
 * Where a featured person's profile lives, or null when they have none.
 *
 * The three roles are reached three different ways, and the difference is not
 * cosmetic: a player's card is a `PlayerProfile` row with its own id, a scout is
 * reached by their account, and a coach has no public page at all. The API sends
 * both ids precisely so this can be decided rather than guessed — a guess would
 * mean a page of confident links to 404s.
 *
 * A member listed as PLAYER who has not built a card yet answers null, and is
 * rendered as plain text. That is a real state: an academy can feature a child
 * who joined last week.
 */
function profileHref(person: AcademyFeatured): string | null {
  if (person?.role === 'PLAYER') return person?.profileId ? `/players/${person?.profileId}` : null;
  if (person?.role === 'SCOUT') return person?.userId ? `/scouts/${person?.userId}` : null;
  // COACH: no public page exists. Linking somewhere approximate would be worse
  // than not linking.
  return null;
}

/**
 * The people an academy chose to put forward, in the order it chose them.
 *
 * ## The rank is shown, because it was a decision
 *
 * A manager ordering ten players is saying something — this is our best, then
 * this one. Rendering them as an unordered set discards the only information the
 * ordering carried, and leaves the reader guessing whether the sequence means
 * anything. So the position is drawn, and the list is an `<ol>`.
 */
export function AcademyFeaturedList({ people }: { people: AcademyFeatured[] }) {
  if (!people?.length) return null;

  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {people.map((person, index) => {
        const href = profileHref(person);
        const name = [person?.firstName, person?.lastName].filter(Boolean).join(' ');

        const body = (
          <>
            {/* `rank` is the manager's stored order; the index is the fallback
                for a legacy row that never had one. */}
            <span className="bg-primary/12 text-primary grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums">
              {person?.rank ?? index + 1}
            </span>
            <Avatar
              src={person?.avatarUrl}
              fallback={initials(person?.firstName, person?.lastName)}
              className="size-9"
            />
            <span className="min-w-0 truncate text-sm font-medium">{name}</span>
          </>
        );

        const shared = 'flex items-center gap-3 rounded-lg border p-2.5 border-border';

        return (
          <li key={`${person?.role}-${person?.memberId}`}>
            {href ? (
              <Link
                href={href}
                // Hover affordance only where there is somewhere to go, so a
                // linked name and an unlinked one are told apart before the
                // click rather than by it.
                className={`${shared} bg-surface-2/50 hover:border-primary/40 hover:bg-surface-2 transition-colors`}
              >
                {body}
              </Link>
            ) : (
              <div className={`${shared} bg-surface-2/50`}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
