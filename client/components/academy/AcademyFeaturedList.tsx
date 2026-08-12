import type { AcademyFeatured } from '@/lib/api/types';
import { Avatar } from '@/components/ui/Avatar';
import { initials } from '@/lib/utils';

/**
 * The people an academy chose to put forward, in the order it chose them.
 *
 * ## The rank is shown, because it was a decision
 *
 * A manager ordering ten players is saying something — this is our best, then
 * this one. Rendering them as an unordered set discards the only information the
 * ordering carried, and leaves the reader guessing whether the sequence means
 * anything. So the position is drawn, and the list is an `<ol>`.
 *
 * ## Not links
 *
 * `AcademyFeatured` carries a `userId`, and the profile routes are keyed on a
 * *player profile* id and a scout's own id — different things. Guessing at the
 * mapping would give a page full of confident links to 404s, which is worse for
 * a visitor than a name that simply is not clickable. Wiring them properly means
 * the API returning the id each profile actually lives at.
 */
export function AcademyFeaturedList({ people }: { people: AcademyFeatured[] }) {
  if (!people?.length) return null;

  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {people.map((person, index) => (
        <li
          key={`${person?.role}-${person?.memberId}`}
          className="border-border bg-surface-2/50 flex items-center gap-3 rounded-lg border p-2.5"
        >
          {/* `rank` is the manager's stored order; the index is the fallback for
              a legacy row that never had one. */}
          <span className="bg-primary/12 text-primary grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums">
            {person?.rank ?? index + 1}
          </span>
          <Avatar
            src={person?.avatarUrl}
            fallback={initials(person?.firstName, person?.lastName)}
            className="size-9"
          />
          <span className="min-w-0 truncate text-sm font-medium">
            {[person?.firstName, person?.lastName].filter(Boolean).join(' ')}
          </span>
        </li>
      ))}
    </ol>
  );
}
