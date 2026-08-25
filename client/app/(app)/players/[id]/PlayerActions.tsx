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
import type { AcademyKind, Follow, MyCoachReview } from '@/lib/api/types';
import { formatDate } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Heart, Mail, Send, UserPlus, X } from 'lucide-react';
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

/** What `GET /recommendations/players/:id/coach-state` answers. */
interface CoachDiscoveryState {
  /** The academy this viewer coaches at, or null if they coach nowhere. */
  academy: { id: string; name: string } | null;
  canAccept: boolean;
  reason:
    | 'NOT_A_COACH'
    | 'LOCAL_TEAM'
    | 'ALREADY_MEMBER'
    | 'ALREADY_APPROVED'
    | 'ALREADY_PENDING'
    | 'OPEN_TRIAL'
    | null;
}

interface AcademyState {
  academy: { id: string; name: string; kind: AcademyKind };
  recommendation: { id: string; status: string; note: string | null } | null;
  review: {
    id: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    note: string | null;
    coachUser: { id: string; firstName: string | null; lastName: string | null };
  } | null;
  /** Set once this academy has invited them to a private trial. */
  invitation: {
    applicationId: string;
    status: string;
    trialId: string;
    trialTitle: string;
    date: string;
  } | null;
  /** False when the academy has endorsed nobody who could take a review. */
  hasCoaches: boolean;
  /**
   * Where the player stands with this squad — the half a local team has instead
   * of the review/trial pipeline. Null if the player profile has since gone.
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
 * buttons to find its own. So: a scout follows and recommends, an academy manager
 * moves the player through review, and nobody sees a control that belongs to
 * somebody else's job.
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
   * Every action here — follow, recommend, send for review, assess — is something
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
            ) : (
              <RecommendDialog playerId={playerId} playerName={playerName} />
            ))}

          {isManager && !isOwnProfile && (
            <ManagerAction playerId={playerId} playerName={playerName} />
          )}

          {isCoach && !isOwnProfile && (
            <>
              <CoachReviewAction playerId={playerId} playerName={playerName} />
              <CoachDiscoveryAction playerId={playerId} />
            </>
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
 * The academy manager's single action, and the only one they get here.
 *
 * It is the same three states as the inbox, because it is the same decision seen
 * from the player's page: nobody has looked yet, a coach has it, a coach has
 * answered. A rejection puts the button back to "send for review" — a coach
 * saying no this month is not a permanent verdict, and the manager may want a
 * second opinion later.
 *
 * No recommendation is required. An academy that finds a player in search may
 * send them to a coach directly; a scout's recommendation is how a player reaches
 * the *inbox*, not permission to look at them.
 */
function ManagerAction({ playerId, playerName }: { playerId: string; playerName: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [coachUserId, setCoachUserId] = React.useState('');

  const { data: state, isLoading } = useQuery({
    queryKey: ['academy-state', playerId],
    queryFn: () =>
      browserFetch<AcademyState | null>(`/recommendations/player/${playerId}/academy-state`),
  });

  const coaches = useQuery({
    queryKey: ['endorsed-coaches', state?.academy.id],
    queryFn: () =>
      browserFetch<
        {
          userId: string;
          user: { id: string; firstName: string | null; lastName: string | null } | null;
        }[]
      >(`/academies/${state?.academy.id}/endorsements?role=COACH`),
    // Never for a local team: it has no coaches by construction, so this would be
    // a round trip whose only possible answer is an empty list.
    enabled: Boolean(state?.academy.id) && state?.academy.kind !== 'LOCAL_TEAM',
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['academy-state', playerId] });
    void queryClient.invalidateQueries({ queryKey: ['inbox-ranked'] });
    void queryClient.invalidateQueries({ queryKey: ['inbox-history'] });
  };

  const assign = useMutation({
    mutationFn: () =>
      browserFetch(`/recommendations/players/${playerId}/review`, {
        method: 'POST',
        body: coachUserId ? { coachUserId } : {},
      }),
    onSuccess: refresh,
    // Said out loud by the shared handler. The panel does change — it becomes
    // "waiting on a coach" — but that is a quiet swap two lines down, and
    // somebody who pressed a button on a phone deserves to be told it worked.
    meta: { success: t.recommendations.sentForReview },
  });

  if (isLoading) return <Skeleton className="h-11 w-full rounded-lg" />;
  if (!state) return null;

  /*
   * A local team's manager does a different job, so they get a different control.
   *
   * Everything below this line is the verified-academy pipeline — send for
   * review, wait on a coach, invite to a private trial — and a local team has
   * none of it (LOCAL_TEAM.md §6–§8). Until now they were shown it anyway and
   * the endpoint behind the button answered 403, which is the failure §5 is
   * about: hiding a control the API refuses is not decoration, it is the screen
   * telling the truth about what this organisation can do.
   *
   * Placed before every other branch rather than folded into them, so the two
   * workflows stay legible as two workflows (LOCAL_TEAM.md §23) instead of one
   * with conditionals threaded through it.
   */
  if (state.academy.kind === 'LOCAL_TEAM') {
    return <LocalTeamAction academyId={state.academy.id} squad={state.squad} onDone={refresh} />;
  }

  if (state?.recommendation?.status === 'ACCEPTED') {
    return (
      <p className="text-success flex items-center gap-1.5 text-sm">
        <Check className="size-4" aria-hidden /> {t.player.alreadyInvited}
      </p>
    );
  }

  const review = state?.review;

  if (review?.status === 'PENDING') {
    return (
      <p className="text-muted text-sm">
        {t.recommendations.awaitingCoach}
        {review?.coachUser.firstName
          ? ` — ${review?.coachUser.firstName} ${review?.coachUser.lastName ?? ''}`
          : ''}
      </p>
    );
  }

  if (state?.invitation) {
    return (
      <p className="text-success flex items-center gap-1.5 text-sm">
        <Check className="size-4" aria-hidden /> {t.recommendations.invited} ·{' '}
        {formatDate(state?.invitation.date)}
      </p>
    );
  }

  if (review?.status === 'APPROVED') {
    return (
      <div className="space-y-2">
        <p className="text-success flex items-center gap-1.5 text-sm">
          <Check className="size-4" aria-hidden /> {t.recommendations.coachApproved}
        </p>
        {/* The same dialog the inbox opens. It used to be an inline note box here
            that posted without a date or a location — which the API now refuses,
            because sending an invitation is what creates the trial. */}
        <InviteToPrivateTrialDialog
          playerId={playerId}
          playerName={playerName}
          academyId={state?.academy.id}
          trigger={
            <Button className="w-full">
              <Mail aria-hidden /> {t.recommendations.invite}
            </Button>
          }
          onInvited={refresh}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {review?.status === 'REJECTED' && (
        <p className="text-muted text-xs">{t.recommendations.rejectedByCoach}</p>
      )}
      {/* The reason instead of the button. `assignReview` refuses with exactly
          this, and an error that explains a control should not have been there
          is a worse answer than not offering it. */}
      {!state?.hasCoaches ? (
        <Alert tone="warning">{t.trials.noCoachesYet}</Alert>
      ) : (
        <>
          <Field label={t.recommendations.sendToCoach} htmlFor="review-coach">
            <Select
              id="review-coach"
              value={coachUserId}
              onChange={(event) => setCoachUserId(event.target.value)}
            >
              <option value="">{t.recommendations.anyCoach}</option>
              {(coaches?.data ?? []).map((row) => (
                <option key={row?.userId} value={row?.userId}>
                  {[row?.user?.firstName, row?.user?.lastName].filter(Boolean).join(' ') ||
                    row?.userId.slice(0, 8)}
                </option>
              ))}
            </Select>
          </Field>
          <Button className="w-full" loading={assign.isPending} onClick={() => assign.mutate()}>
            <Send aria-hidden /> {t.recommendations.sendForReview}
          </Button>
        </>
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

/**
 * The coach's Accept/Reject, on the profile they are actually reading.
 *
 * ## Why it belongs here
 *
 * An online review asks a coach to judge a profile — the clips, the numbers, the
 * position. That is this page. Sending them to a queue to answer a question they
 * have already answered in their head is a round trip for no reason, so the two
 * buttons sit where the evidence is.
 *
 * ## Why it is usually absent
 *
 * It renders only when an academy has actually handed this coach this player.
 * That is the rule, not a nicety: a coach may judge nobody they were not given
 * (TRIAL.md §33, Rule 16). `myReviewFor` returns null otherwise, and the decision
 * endpoint checks the same assignment again before writing — so a coach who
 * forges the request gains nothing.
 *
 * Accepting needs all eight ratings, which do not fit here, so an accept sends
 * them to the full screen. A rejection needs none, and can be given from here.
 */
function CoachReviewAction({ playerId, playerName }: { playerId: string; playerName: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const review = useQuery({
    queryKey: ['my-review', playerId],
    queryFn: () =>
      browserFetch<MyCoachReview | null>(`/recommendations/player/${playerId}/my-review`),
  });

  const decide = useMutation({
    mutationFn: (reviewId: string) =>
      browserFetch(`/recommendations/reviews/${reviewId}/decision`, {
        method: 'POST',
        body: { decision: 'REJECTED' },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-review', playerId] });
      void queryClient.invalidateQueries({ queryKey: ['my-reviews'] });
    },
  });

  if (review?.isLoading) return <Skeleton className="h-20 w-full rounded-lg" />;

  // Nobody gave this coach this player. Nothing to offer, and saying so would
  // only advertise a door they cannot open.
  if (!review?.data) return null;

  const { id, status, academy } = review?.data;

  if (status !== 'PENDING') {
    return (
      <Alert tone={status === 'APPROVED' ? 'success' : 'info'}>
        {status === 'APPROVED' ? t.recommendations.approved : t.recommendations.rejected}
        {academy?.name ? ` · ${academy?.name}` : ''}
      </Alert>
    );
  }

  return (
    <div className="border-border space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">{t.trials.onlineCoachReview}</p>
      <p className="text-muted text-xs">
        {academy?.name} · {t.recommendations.reviewAskedOf}
      </p>

      <div className="flex flex-wrap gap-2">
        {/* An accept writes eight ratings, which do not belong in a sidebar —
            the full screen is where a coach scores what they watched. */}
        <Button asChild size="sm" className="flex-1">
          <Link href={`/recommendations/review#${id}`}>
            <Check aria-hidden /> {t.recommendations.approvePlayer}
          </Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-danger flex-1"
          loading={decide.isPending}
          onClick={() => {
            if (window.confirm(t.recommendations.confirmReject.replace('{name}', playerName))) {
              decide.mutate(id);
            }
          }}
        >
          <X aria-hidden /> {t.recommendations.rejectPlayer}
        </Button>
      </div>
    </div>
  );
}

/**
 * A coach putting forward a player nobody sent them.
 *
 * ## Why this is not an invitation
 *
 * A coach never invites anybody to a trial — that is the manager's decision, and
 * the player's to answer (TRIAL.md §11). What a coach has is an opinion, and this
 * is the button for it: the same **online review ACCEPT** they would give a player
 * their manager had sent them, reached from the player's own profile instead of
 * from the inbox. The manager then sees the approval waiting on their dashboard
 * and decides whether a trial follows.
 *
 * So the label says "approve", the confirmation says what happens next, and the
 * word "invite" appears nowhere.
 *
 * ## Why it asks before it draws
 *
 * `/recommendations/players/:id/coach-state` answers with the same four checks the
 * POST applies, so a coach reads *"already at your academy"* rather than pressing
 * a button that answers 409. A viewer who is not a coach at an academy gets
 * `NOT_A_COACH` and nothing is drawn — the query is harmless for them, and the
 * server never has to 403 an ordinary profile view.
 */
function CoachDiscoveryAction({ playerId }: { playerId: string }) {
  const { t, f } = useI18n();
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: ['coach-state', playerId],
    queryFn: () =>
      browserFetch<CoachDiscoveryState>(`/recommendations/players/${playerId}/coach-state`),
  });

  const accept = useMutation({
    mutationFn: () =>
      browserFetch(`/recommendations/players/${playerId}/coach-accept`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['coach-state', playerId] });
      void queryClient.invalidateQueries({ queryKey: ['my-review', playerId] });
      void queryClient.invalidateQueries({ queryKey: ['my-reviews'] });
    },
  });

  if (state?.isLoading) return <Skeleton className="h-20 w-full rounded-lg" />;

  const data = state?.data;
  // Not a coach anywhere, or a local team, which runs no online review at all.
  if (!data?.academy || data?.reason === 'LOCAL_TEAM') return null;

  /*
   * A blocked coach is told why, not shown a disabled button.
   *
   * `ALREADY_PENDING` is the one worth naming: it is the case where *this* coach
   * may be the one holding the review, and `CoachReviewAction` above is already
   * showing them the accept/reject pair. Repeating it as a blocked action would
   * read as a contradiction, so it says what is true and stops.
   */
  if (!data?.canAccept) {
    const reasons: Record<string, string> = {
      ALREADY_MEMBER: t.recommendations.coachBlockedMember,
      ALREADY_APPROVED: t.recommendations.coachBlockedApproved,
      ALREADY_PENDING: t.recommendations.coachBlockedPending,
      OPEN_TRIAL: t.recommendations.coachBlockedTrial,
    };
    const reason = data?.reason ? reasons[data?.reason] : undefined;
    if (!reason) return null;
    return <p className="text-muted text-xs">{reason}</p>;
  }

  return (
    <div className="border-border space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">{t.recommendations.coachDiscoverTitle}</p>
      <p className="text-muted text-xs">
        {f(t.recommendations.coachDiscoverHint, { academy: data?.academy.name })}
      </p>

      {accept.isError && (
        <Alert tone="danger">{(accept.error as Error)?.message ?? t.common.somethingWrong}</Alert>
      )}

      {/*
        Straight through, with no confirmation — the same rule the review queue
        follows. An accept says "worth a look" and commits nobody: the manager
        still decides whether to invite, the player still decides whether to
        come, and the coach still has to judge them on a pitch. The academy it
        goes to is named in the line above, which is the one fact a coach who
        works for two clubs needs before pressing.
      */}
      <Button
        size="sm"
        className="w-full"
        loading={accept.isPending}
        onClick={() => accept.mutate()}
      >
        <Check aria-hidden /> {t.recommendations.coachDiscoverAction}
      </Button>
    </div>
  );
}
