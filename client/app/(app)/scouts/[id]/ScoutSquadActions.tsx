'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Check, Clock, ShieldCheck, UserPlus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { ScoutProfile } from '@/lib/api/resources';
import { useI18n } from '@/components/layout/I18nProvider';
import { Alert } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

type Standing = NonNullable<ScoutProfile['viewerAcademy']>;

/**
 * What a manager can do about this scout, as one control in three states.
 *
 * ## The scout answers, and that finishes it
 *
 * A membership is a claim on somebody's record, so the platform asks rather than
 * writes itself onto a person: the manager invites, the scout accepts, and
 * `InvitationsService.decide` creates the membership *and* the endorsement in one
 * transaction. That pairing is deliberate — `EndorsementsService` has no grant
 * route precisely so "who works here" and "who this academy vouches for" cannot
 * disagree.
 *
 * Which is why there is no second "add to squad" press after acceptance: by then
 * the scout is already on the books, already able to address recommendations
 * here, and already inside the private-profile door that membership of a
 * verified academy opens. A button at that point would do nothing.
 *
 * ## The warning is on the invitation
 *
 * It is the only act the manager controls, and it is the one with consequences:
 * accepting puts this person inside the club and, at a verified academy, in
 * sight of children who asked to be hidden. So the confirm is here, where the
 * decision actually is, rather than on a later step that cannot refuse.
 */
export function ScoutSquadActions({
  scoutId,
  scoutName,
  standing,
}: {
  scoutId: string;
  scoutName: string;
  standing: Standing;
}) {
  const { t, f } = useI18n();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      browserFetch(`/academies/${standing.academyId}/invitations`, {
        method: 'POST',
        body: { userId: scoutId, role: 'SCOUT' },
      }),
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="text-primary size-4" aria-hidden /> {standing.academyName}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}

        {/* Done: on the books and endorsed. Nothing left to press. */}
        {standing.isEndorsed ? (
          <p className="text-success flex items-center gap-1.5 text-sm">
            <ShieldCheck className="size-4 shrink-0" aria-hidden /> {t.scouts.inSquad}
          </p>
        ) : standing.isMember ? (
          <>
            <p className="text-success flex items-center gap-1.5 text-sm">
              <Check className="size-4 shrink-0" aria-hidden /> {t.scouts.acceptedInvite}
            </p>
            {/* Membership at an unverified academy opens no private profiles —
                the manager should know that before wondering why. */}
            {!standing.verified && <Alert tone="warning">{t.scouts.academyNotVerified}</Alert>}
          </>
        ) : standing.invitationPending ? (
          <p className="text-muted flex items-center gap-1.5 text-sm">
            <Clock className="size-4 shrink-0" aria-hidden /> {t.scouts.invitePending}
          </p>
        ) : (
          <>
            <p className="text-muted text-sm">{t.scouts.inviteHint}</p>
            <Button
              className="w-full"
              loading={invite.isPending}
              onClick={() => {
                if (window.confirm(f(t.scouts.inviteWarning, { name: scoutName }))) {
                  invite.mutate();
                }
              }}
            >
              <UserPlus aria-hidden /> {t.scouts.inviteToSquad}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
