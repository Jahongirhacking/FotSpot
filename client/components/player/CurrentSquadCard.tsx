import Link from 'next/link';
import { Building2, History, ShieldCheck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { PlayerMemberships, SquadMembership } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';
import { LeaveTeamButton } from './LeaveTeamButton';

/**
 * Where this player plays, and where they used to.
 *
 * ## Three answers, kept apart
 *
 * One academy, any number of local teams, and a history of academies left. The
 * product treats those differently — an academy is exclusive and cannot be left
 * voluntarily, a local team is neither — so showing them in one list would be
 * showing the reader a rule the product does not have.
 *
 * ## The empty states are the point
 *
 * A profile with no squad section and a player who is with nobody look identical
 * otherwise, and they mean opposite things to a scout deciding whether to make
 * an approach. Both lists say so out loud rather than disappearing. History is
 * the exception: a player who has never left an academy has no history, and an
 * empty "Academy history" heading is a fact about the interface rather than
 * about them.
 *
 * ## `canLeave` is a display decision, not the boundary
 *
 * It is true only on the player's own screens, and only local teams ever render
 * the control at all — `AcademiesService.leaveTeam` refuses an academy and
 * refuses acting on anybody else's membership, whatever this component draws.
 */
export function CurrentSquadCard({
  memberships,
  t,
  canLeave = false,
  className,
}: {
  memberships?: PlayerMemberships;
  t: Dictionary;
  /** True on the viewer's own profile — see the note above. */
  canLeave?: boolean;
  className?: string;
}) {
  const academy = memberships?.academy ?? null;
  const localTeams = memberships?.localTeams ?? [];
  const history = memberships?.academyHistory ?? [];

  return (
    <div className={className}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="text-primary size-4" aria-hidden /> {t.academy?.currentAcademy}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {academy ? (
            <SquadRow membership={academy} t={t} />
          ) : (
            <p className="text-muted text-sm">{t.academy?.noCurrentAcademy}</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="text-primary size-4" aria-hidden /> {t.academy?.localTeams}
            {localTeams.length > 0 && (
              <span className="text-muted text-xs font-normal">{localTeams.length}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {localTeams.length === 0 ? (
            <p className="text-muted text-sm">{t.academy?.noLocalTeams}</p>
          ) : (
            <ul className="divide-border divide-y">
              {localTeams.map((team) => (
                <li key={team?.academyId} className="py-3 first:pt-0 last:pb-0">
                  <SquadRow
                    membership={team}
                    t={t}
                    action={
                      canLeave ? (
                        <LeaveTeamButton
                          academyId={team?.academyId}
                          academyName={team?.academyName}
                        />
                      ) : null
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Only once there is something to show — see the note above. */}
      {history.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="text-muted size-4" aria-hidden /> {t.academy?.academyHistory}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-border divide-y">
              {history.map((past) => (
                <li
                  key={past?.academyId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                >
                  <Link
                    href={`/academies/${past?.academyId}`}
                    className="min-w-0 text-sm hover:underline"
                  >
                    {past?.academyName}
                  </Link>
                  {/* The span they were there, which is what makes a history a
                      history rather than a list of names. */}
                  <span className="text-muted text-xs">
                    {formatDate(past?.joinedAt)}
                    {past?.leftAt ? ` – ${formatDate(past?.leftAt)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** One squad: who, which group, and a way in. */
function SquadRow({
  membership,
  t,
  action,
}: {
  membership: SquadMembership;
  t: Dictionary;
  action?: React.ReactNode;
}) {
  const isLocalTeam = membership?.kind === 'LOCAL_TEAM';

  return (
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

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{membership?.academyName}</span>
          {isLocalTeam ? (
            <Badge variant="neutral">{t.academy?.localTeam}</Badge>
          ) : (
            <Badge variant="success">
              <ShieldCheck className="size-3" aria-hidden /> {t.academy?.verifiedAcademyType}
            </Badge>
          )}
        </p>
        {/* A null group is the reserve by the schema's own definition — said in
            words rather than left as a gap the reader has to interpret. */}
        <p className="text-muted text-xs">
          {t.academy?.squad}: {membership?.groupName ?? t.academy?.squadReserve}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={`/academies/${membership?.academyId}`}>
            {isLocalTeam ? t.academy?.viewTeam : t.academy?.viewAcademy}
          </Link>
        </Button>
        {action}
      </div>
    </div>
  );
}
