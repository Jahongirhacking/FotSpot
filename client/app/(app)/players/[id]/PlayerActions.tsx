'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { useSession } from '@/components/layout/SessionProvider';
import { InviteToPrivateTrialDialog } from '@/components/trials/InviteToPrivateTrialDialog';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { Alert, Skeleton } from '@/components/ui/Feedback';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { browserFetch } from '@/lib/api/browser';
import type {
  AcademyKind,
  Follow,
  RecommendEligibility,
  TrialApplicationStatus,
} from '@/lib/api/types';
import { formatDate } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Heart, Mail, Send, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

interface MyRecommendation {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  note: string | null;
  createdAt: string;
  /** Set while the three-month cooldown is running; null once it has passed. */
  canRecommendAgainAt: string | null;
}

/** What `GET /recommendations/player/:id/academy-state` answers. */
interface AcademyState {
  academy: { id: string; name: string; kind: AcademyKind };
  /** What the viewer is to that academy — who names the coach, and who is one. */
  role: 'MANAGER' | 'COACH';
  recommendation: { id: string; status: string; note: string | null } | null;
  /** The latest private trial this academy invited them to, whatever came of it. */
  invitation: {
    applicationId: string;
    status: TrialApplicationStatus;
    trialId: string;
    trialTitle: string;
    date: string | null;
  } | null;
  /** False when the academy has endorsed nobody who could run a trial. */
  hasCoaches: boolean;
  /**
   * Where the player stands with this squad — the half a local team has instead
   * of the trial pipeline. Null if the player profile has since gone.
   */
  squad: {
    /** An invitation is addressed to the account, not the player profile. */
    userId: string;
    /** ACTIVE/INACTIVE while they are in the squad; null once released or never in. */
    status: 'ACTIVE' | 'INACTIVE' | null;
    invitationPending: boolean;
  } | null;
}

/**
 * What this viewer can do about this player — one action, chosen by their role.
 *
 * A panel that offers everybody everything makes each role read the other roles'
 * buttons to find its own. So: a scout follows and recommends, an academy's
 * manager or coach invites the player to a private trial, and nobody sees a
 * control that belongs to somebody else's job.
 *
 * Gated by the *active* role for clarity, not for security — every endpoint below
 * checks the caller again regardless of what is drawn.
 */
export function PlayerActions({
  playerId,
  playerName,
  playerUserId,
}: {
  playerId: string;
  playerName: string;
  /** Whose account this card belongs to — used only to recognise your own. */
  playerUserId?: string;
}) {
  const { t } = useI18n();
  const { activeRole, isAuthenticated } = useSession();
  const requireAuth = useRequireAuth();
  const queryClient = useQueryClient();

  const isScout = !isAuthenticated || activeRole === 'scout';
  const isManager = activeRole === 'academy_manager';
  const isCoach = activeRole === 'coach';

  const { data: following } = useQuery({
    queryKey: ['follows', 'player'],
    queryFn: () => browserFetch<{ items: Follow[] }>('/follows/me?targetType=PLAYER'),
    // A guest has no follow list; asking for one 401s and used to bounce them to
    // the login page just for opening a profile.
    enabled: isAuthenticated,
  });

  // A scout gets one recommendation per player, so the panel has to know whether
  // this one is spent before it offers the button again.
  const { data: mine } = useQuery({
    queryKey: ['my-recommendation', playerId],
    queryFn: () =>
      browserFetch<MyRecommendation | null>(`/recommendations/player/${playerId}/mine`),
    enabled: isAuthenticated && activeRole === 'scout',
  });

  // Whether there is anybody to recommend this player to. A player an academy
  // already has, or is already trying on a pitch, cannot be put forward, and
  // the panel says why instead of drawing a button the API would refuse.
  const { data: eligibility } = useQuery({
    queryKey: ['recommend-eligibility', playerId],
    queryFn: () =>
      browserFetch<RecommendEligibility>(`/recommendations/player/${playerId}/eligibility`),
    enabled: isAuthenticated && activeRole === 'scout',
  });

  /*
   * Is this my own profile?
   *
   * Asked here rather than passed from the server because the session cookie
   * carries no user id — see the note in the trial page. `/users/me` is small,
   * already warm for a signed-in viewer, and answers definitively; a guest skips
   * it, since a guest is nobody's own profile.
   */
  const { data: me } = useQuery({
    queryKey: ['me', 'id'],
    queryFn: () => browserFetch<{ id: string }>('/users/me'),
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
  });
  const isOwnProfile = Boolean(playerUserId && me?.id && playerUserId === me.id);

  const isFollowing = following?.items.some((follow) => follow.targetId === playerId) ?? false;

  const toggleFollow = useMutation({
    mutationFn: () =>
      browserFetch('/follows', {
        method: isFollowing ? 'DELETE' : 'POST',
        body: { targetType: 'PLAYER', targetId: playerId },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follows', 'player'] }),
  });

  // Guests see it and are sent to login on click; signed-in users need the role.
  /**
   * Recommending is a scout's action and only a scout's (§1.5).
   *
   * It is the one thing the reputation system measures, and it is measured per
   * scout — the level tiers and the §1.5.1 harmonic credibility all key off a
   * scout identity, so a coach filing one would build a reputation nothing in
   * the product shows. Keyed on the *acting* role, matching the @Roles('scout')
   * guard on the endpoint: a scout who is also a coach must be wearing the scout
   * hat, or the button would open a dialog that 403s on submit.
   *
   * Guests still see it — pressing it is what sends them to sign in (§1.2), and
   * hiding the reason to make an account from the people who don't have one yet
   * is the wrong trade.
   */
  /*
   * Whether this card offers anything at all.
   *
   * Every action here — follow, recommend, invite, assess — is something
   * one person does about another, so your own profile offers none of them
   * whatever role you are wearing. The backend refuses each of these on a
   * self-target too (see RecommendationsService.create, CoachesService
   * .createAssessment, FollowsService.follow); this is the clarity half.
   */
  const hasAnyAction = !isOwnProfile;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.player.actions}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Following is for anybody, not only scouts.
              It was gated to scouts on the reasoning that a manager decides about
              players rather than collecting them — but that left a player looking
              at another player with an empty card and nothing to do, which is the
              one thing a profile page should never be. Keeping up with somebody
              is not a scouting privilege.
              Never on your own profile: following yourself is not a thing the
              product means, and the API has nothing to do with it either. */}
          {!isOwnProfile && (
            <Button
              variant={isFollowing ? 'outline' : 'primary'}
              className="w-full"
              loading={toggleFollow.isPending}
              onClick={() => {
                if (requireAuth()) toggleFollow.mutate();
              }}
            >
              {isFollowing ? (
                <>
                  <Heart aria-hidden /> {t.relation.following}
                </>
              ) : (
                <>
                  <UserPlus aria-hidden /> {t.player.followPlayer}
                </>
              )}
            </Button>
          )}

          {isScout &&
            !isOwnProfile &&
            (mine ? (
              <RecommendationResult mine={mine} />
            ) : eligibility?.reason ? (
              <p className="text-muted text-sm">
                {eligibility.reason === 'IN_ACADEMY'
                  ? t.player.cannotRecommendInAcademy
                  : t.player.cannotRecommendInTrial}
              </p>
            ) : (
              <RecommendDialog playerId={playerId} playerName={playerName} />
            ))}

          {/* The same panel for both: a manager and a coach both invite a player
              to a private trial (TRIAL.md §11), and the API tells the panel which
              of the two is reading. */}
          {(isManager || isCoach) && !isOwnProfile && (
            <AcademyAction playerId={playerId} playerName={playerName} />
          )}

          {/* Says so, rather than leaving a titled card with nothing under it.
              An empty panel reads as something that failed to load — the reader
              cannot tell "nothing for you here" from "this broke", and waits. */}
          {!hasAnyAction && <p className="text-muted text-sm">{t.player?.noActions}</p>}
        </CardContent>
      </Card>

      {activeRole === 'coach' && !isOwnProfile && (
        <Alert tone="info" title={t.dashboard.assessPlayer}>
          {t.player.coachAssessHint}
        </Alert>
      )}
    </div>
  );
}

/**
 * What became of the recommendation this scout filed for this player.
 *
 * A disabled button rather than a hidden one: "you already did this, and here is
 * what happened" answers the question the scout came back to ask, where an absent
 * control just looks like a bug.
 *
 * A rejection is not the end of it. The door reopens three months on, and the
 * date is on the screen — a scout who was early rather than wrong needs to know
 * the block lifts, not merely that it is there.
 */
function RecommendationResult({ mine }: { mine: MyRecommendation }) {
  const { t } = useI18n();
  const label =
    mine.status === 'ACCEPTED'
      ? t.recommendations.statusAccepted
      : mine.status === 'REJECTED'
        ? t.recommendations.statusRejected
        : t.recommendations.statusPending;

  return (
    <div className="space-y-1.5">
      <Button variant="outline" className="w-full" disabled>
        <Check aria-hidden /> {t.player.alreadyRecommended}
      </Button>
      <p className="text-muted text-xs">{f2(t.player.recommendationResult, label)}</p>
      {mine.canRecommendAgainAt && (
        <p className="text-muted text-xs">
          {f2(t.player.recommendAgainOn, formatDate(mine.canRecommendAgainAt))}
        </p>
      )}
    </div>
  );
}

/** Tiny local interpolation so this file needs no extra plumbing. */
function f2(template: string, value: string) {
  return template.replace('{status}', value);
}

/**
 * The academy's single action about a player, and the only one it gets here.
 *
 * It is the same decision seen from the player's page as from the inbox:
 * invite them to a private trial, or not. Nothing is decided online — the trial
 * answers (TRIAL.md §11) — so the panel has only to say where that stands:
 * nobody has asked yet, an invitation is out, the trial has answered.
 *
 * Read by a manager and by a coach alike. Both may send the invitation; a
 * manager names the coach who will run the session and a coach is that person
 * themselves, which is the one difference and the dialog handles it.
 *
 * No recommendation is required. An academy that finds a player in search may
 * invite them directly; a scout's recommendation is how a player reaches the
 * *inbox*, not permission to look at them.
 */
function AcademyAction({ playerId, playerName }: { playerId: string; playerName: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const { data: state, isLoading } = useQuery({
    queryKey: ['academy-state', playerId],
    queryFn: () =>
      browserFetch<AcademyState | null>(`/recommendations/player/${playerId}/academy-state`),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['academy-state', playerId] });
    void queryClient.invalidateQueries({ queryKey: ['inbox-ranked'] });
    void queryClient.invalidateQueries({ queryKey: ['inbox-history'] });
  };

  if (isLoading) return <Skeleton className="h-11 w-full rounded-lg" />;
  // A coach at no academy, or a manager of none: nothing to invite them to.
  if (!state) return null;

  /*
   * A local team's manager does a different job, so they get a different control.
   *
   * Everything below this line is the verified-academy pipeline — invite to a
   * private trial, wait on the answer, wait on the day — and a local team has
   * none of it (LOCAL_TEAM.md §6–§8). Until now they were shown it anyway and
   * the endpoint behind the button answered 403, which is the failure §5 is
   * about: hiding a control the API refuses is not decoration, it is the screen
   * telling the truth about what this organisation can do.
   *
   * Placed before every other branch rather than folded into them, so the two
   * workflows stay legible as two workflows (LOCAL_TEAM.md §23) instead of one
   * with conditionals threaded through it. A local team has no coaches, so
   * only its manager ever reaches this.
   */
  if (state.academy.kind === 'LOCAL_TEAM') {
    if (state.role !== 'MANAGER') return null;
    return <LocalTeamAction academyId={state.academy.id} squad={state.squad} onDone={refresh} />;
  }

  // Already one of ours, or asked to be: the trial has done its work.
  if (state.squad?.status) {
    return (
      <p className="text-success flex items-center gap-1.5 text-sm">
        <Check className="size-4" aria-hidden /> {t.player.alreadyInSquad}
      </p>
    );
  }
  if (state.squad?.invitationPending) {
    return <p className="text-muted text-sm">{t.player.squadInviteSent}</p>;
  }

  const invitation = state.invitation;

  // An invitation is out, or the player is coming: nothing to send until the
  // trial answers. Inviting again would be a 409 from the API anyway.
  if (invitation && (invitation.status === 'INVITED' || invitation.status === 'CONFIRMED')) {
    return (
      <p className="text-success flex items-center gap-1.5 text-sm">
        <Check className="size-4" aria-hidden />
        <Link href={`/trials/${invitation.trialId}`} className="hover:underline">
          {invitation.status === 'CONFIRMED' ? t.trials.statusConfirmed : t.recommendations.invited}
          {invitation.date ? ` · ${formatDate(invitation.date)}` : ''}
        </Link>
      </p>
    );
  }

  // Passed: the manager's next step is the squad, and that lives on their
  // dashboard and the trial's own page rather than here.
  if (invitation?.status === 'PASSED') {
    return (
      <p className="text-success flex items-center gap-1.5 text-sm">
        <Check className="size-4" aria-hidden />
        <Link href={`/trials/${invitation.trialId}`} className="hover:underline">
          {t.trials.verdictPassed}
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* A verdict or a no is not permanent: a second look is a second trial.
          Said quietly above the button rather than hidden. */}
      {invitation?.status === 'FAILED' && (
        <p className="text-muted text-xs">{t.trials.verdictFailed}</p>
      )}
      {invitation?.status === 'REJECTED' && (
        <p className="text-muted text-xs">{t.player.declinedInvitation}</p>
      )}
      {/* The reason instead of the button. The invitation refuses without a
          coach to name, and an error that explains a control should not have
          been there is a worse answer than not offering it. */}
      {!state.hasCoaches ? (
        <Alert tone="warning">{t.trials.noCoachesYet}</Alert>
      ) : (
        <InviteToPrivateTrialDialog
          playerId={playerId}
          playerName={playerName}
          academyId={state.academy.id}
          role={state.role}
          recommendationId={state.recommendation?.id}
          trigger={
            <Button className="w-full" variant="violet">
              <Mail aria-hidden /> {t.recommendations.inviteToPrivateTrial}
            </Button>
          }
          onInvited={refresh}
        />
      )}
    </div>
  );
}

/**
 * The local team manager's one action: ask this player to join the squad.
 *
 * ## Why it is an invitation and not an "add"
 *
 * The button says "Add to squad" because that is what the manager is doing, but
 * what it sends is an invitation — nobody is put into a squad without agreeing to
 * it (LOCAL_TEAM.md §9, and the reasoning already in InvitationsService: an
 * academy cannot simply add people). The player answers from their invitations
 * screen and joins on acceptance. Reusing that flow rather than minting a second
 * one also means release, re-invitation and the squad notifications all keep
 * working unchanged.
 *
 * ## What it deliberately does not do
 *
 * Nothing about recommendations. Joining a local team is a squad placement, not a
 * professional verdict (§11) — no recommendation is settled, cleared or counted,
 * and no scout's success rate moves. That is enforced in the invitation flow
 * itself; this component simply has no code that could.
 */
function LocalTeamAction({
  academyId,
  squad,
  onDone,
}: {
  academyId: string;
  squad: AcademyState['squad'];
  onDone: () => void;
}) {
  const { t } = useI18n();

  const invite = useMutation({
    mutationFn: () =>
      browserFetch(`/academies/${academyId}/invitations`, {
        method: 'POST',
        body: { userId: squad?.userId, role: 'PLAYER' },
      }),
    onSuccess: onDone,
    meta: { success: t.player.squadInviteSent },
  });

  // The profile exists but its player row does not, which leaves nothing to
  // address an invitation to. Rare, and not worth a control that cannot work.
  if (!squad) return null;

  if (squad.status) {
    return (
      <p className="text-success flex items-center gap-1.5 text-sm">
        <Check className="size-4" aria-hidden /> {t.player.alreadyInSquad}
      </p>
    );
  }

  if (squad.invitationPending) {
    return <p className="text-muted text-sm">{t.player.squadInviteSent}</p>;
  }

  return (
    <div className="space-y-1.5">
      <Button className="w-full" loading={invite.isPending} onClick={() => invite.mutate()}>
        <UserPlus aria-hidden /> {t.academy.addToSquad}
      </Button>
      {/* Says what pressing it actually does. "Add to squad" on its own reads as
          immediate, and the player has to accept first. */}
      <p className="text-muted text-xs">{t.player.addToSquadHint}</p>
    </div>
  );
}

function RecommendDialog({ playerId, playerName }: { playerId: string; playerName: string }) {
  const { t, f } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [academyId, setAcademyId] = React.useState('');
  const [note, setNote] = React.useState('');

  // Only academies that ENDORSE this scout may be targeted (README §1.5.3);
  // following one is not enough, so the generic academy list would offer choices
  // the backend would reject.
  const { data: endorsing } = useQuery({
    queryKey: ['endorsing-academies'],
    queryFn: () =>
      browserFetch<{ academy: { id: string; name: string } }[]>(
        '/recommendations/endorsing-academies',
      ),
    enabled: open,
  });

  const recommend = useMutation({
    mutationFn: () =>
      browserFetch('/recommendations', {
        method: 'POST',
        body: {
          playerId,
          // No academy chosen means a global recommendation — open to any scout
          // and addressed to nobody (§1.5.3).
          type: academyId ? 'SPECIFIC' : 'GLOBAL',
          ...(academyId ? { academyIds: [academyId] } : {}),
          note: note || undefined,
        },
      }),
    /*
     * Filing a recommendation changes two things this component does not own, and
     * closing the dialog told neither of them.
     *
     * `router.refresh()` is for the scout's own statistics. They are rendered by
     * Server Components — ScoutHome on the dashboard and the aside on
     * /recommendations — which fetch with `cache: 'no-store'`, so the *fetch* was
     * never stale. What was stale is Next's router cache: nothing asked those
     * segments to render again, so the scout filed two recommendations and kept
     * reading "Yuborilgan: 0" and "0/10" until a hard reload. This is the same
     * call AcademyTrials and TrialAdmin already make after their mutations.
     *
     * The invalidation is for this page: `RecommendationResult` above swaps the
     * button for "already recommended" from `player-recommendation`, and it would
     * otherwise keep offering to file the one just filed.
     */
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['my-recommendation', playerId] });
      router.refresh();
    },
    meta: { success: t.recommendations.recommendationSent },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" className="w-full">
          <Send aria-hidden /> {t.player.recommendToAcademy}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{f(t.recommendations.recommendTitle, { name: playerName })}</DialogTitle>
          <DialogDescription>{t.recommendations.recommendSubtitle}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <Field label={t.recommendations.chooseAcademy} htmlFor="academyId" required>
            <Select
              id="academyId"
              value={academyId}
              onChange={(event) => setAcademyId(event.target.value)}
            >
              <option value="">{t.recommendations.globalType}</option>
              {endorsing?.map(({ academy }) => (
                <option key={academy?.id} value={academy?.id}>
                  {academy?.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t.recommendations.whyThisPlayer}
            htmlFor="note"
            hint={t.recommendations.whyHint}
          >
            <Textarea
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
              placeholder={t.recommendations.whyPlaceholder}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t.common.cancel}
          </Button>
          <Button loading={recommend.isPending} onClick={() => recommend.mutate()}>
            {t.recommendations.sendRecommendation}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
