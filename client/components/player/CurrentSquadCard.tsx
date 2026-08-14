import Link from 'next/link';
import { Building2, ShieldCheck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { CurrentSquad } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n';

/**
 * Where this player currently plays.
 *
 * ## The empty state is the point
 *
 * A profile with no squad card and a profile whose player is unattached look
 * identical, and they mean opposite things to a scout deciding whether to make
 * an approach. So this renders in all three states — verified academy, local
 * team, and nobody — and says the third one out loud rather than disappearing.
 *
 * ## The type comes from the server
 *
 * `kind` is read, never inferred. Whether an organisation counts as a verified
 * academy is a backend rule with real consequences attached to it (who may see
 * a private profile, who may hold trials), and a card that worked it out from
 * the name or the status would be a second, quietly diverging copy of it.
 *
 * The link is to the organisation's own page for an academy and for a local
 * team alike: a local team is absent from the *directory* (§13), which is not
 * the same as being unreachable — somebody reading this card already knows it
 * exists.
 */
export function CurrentSquadCard({
  squad,
  t,
  className,
}: {
  squad?: CurrentSquad | null;
  t: Dictionary;
  className?: string;
}) {
  const isLocalTeam = squad?.kind === 'LOCAL_TEAM';

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="text-primary size-4" aria-hidden /> {t.academy?.currentSquad}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {!squad ? (
          <p className="text-muted text-sm">{t.academy?.noSquad}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className={
                isLocalTeam
                  ? 'bg-surface-3 text-muted grid size-9 shrink-0 place-items-center rounded-lg'
                  : 'bg-primary/12 text-primary grid size-9 shrink-0 place-items-center rounded-lg'
              }
              aria-hidden
            >
              {isLocalTeam ? <Users className="size-4" /> : <Building2 className="size-4" />}
            </span>

            <Link
              href={`/academies/${squad?.academyId}`}
              className="min-w-0 font-medium hover:underline"
            >
              {squad?.academyName}
            </Link>

            {isLocalTeam ? (
              <Badge variant="neutral">{t.academy?.localTeam}</Badge>
            ) : (
              <Badge variant="success">
                <ShieldCheck className="size-3" aria-hidden /> {t.academy?.verifiedAcademyType}
              </Badge>
            )}

            {/* Null groupId is the reserve, by the schema's own definition —
                said in words here rather than left as a gap the reader has to
                interpret as "not in a squad group yet". */}
            {squad?.groupId === null && (
              <span className="text-muted text-xs">{t.academy?.squadReserve}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
