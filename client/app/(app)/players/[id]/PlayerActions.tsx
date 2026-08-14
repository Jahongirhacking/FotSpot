'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Check, Heart, Mail, Send, UserPlus, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Follow, MyCoachReview } from '@/lib/api/types';
import { useSession } from '@/components/layout/SessionProvider';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, Skeleton } from '@/components/ui/Feedback';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { useI18n } from '@/components/layout/I18nProvider';
import { formatDate } from '@/lib/utils';
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
import { InviteToPrivateTrialDialog } from '@/components/trials/InviteToPrivateTrialDialog';

interface MyRecommendation {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  note: string | null;
  createdAt: string;
  /** Set while the three-month cooldown is running; null once it has passed. */
  canRecommendAgainAt: string | null;
}

interface AcademyState {
  academy: { id: string; name: string };
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

          {isScout && !isOwnProfile &&
            (mine ? (
              <RecommendationResult mine={mine} />
            ) : (
              <RecommendDialog playerId={playerId} playerName={playerName} />
            ))}

          {isManager && !isOwnProfile && <ManagerAction playerId={playerId} playerName={playerName} />}

          {isCoach && !isOwnProfile && <CoachReviewAction playerId={playerId} playerName={playerName} />}

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
    enabled: Boolean(state?.academy.id),
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

function RecommendDialog({ playerId, playerName }: { playerId: string; playerName: string }) {
  const { t } = useI18n();
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
          <Send aria-hidden /> Recommend to an academy
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recommend {playerName}</DialogTitle>
          <DialogDescription>
            Your reputation moves only when an academy accepts. Recommending everyone lowers your
            success rate, so pick carefully.
          </DialogDescription>
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
            Cancel
          </Button>
          <Button loading={recommend.isPending} onClick={() => recommend.mutate()}>
            Send recommendation
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
