'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Heart, Mail, Send, UserPlus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Follow } from '@/lib/api/types';
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
export function PlayerActions({ playerId, playerName }: { playerId: string; playerName: string }) {
  const { t } = useI18n();
  const { activeRole, isAuthenticated } = useSession();
  const requireAuth = useRequireAuth();
  const queryClient = useQueryClient();

  const isScout = !isAuthenticated || activeRole === 'scout';
  const isManager = activeRole === 'academy_manager';

  const { data: following } = useQuery({
    queryKey: ['follows', 'player'],
    queryFn: () => browserFetch<{ items: Follow[] }>('/follows/me?targetType=PLAYER'),
    // A guest has no follow list; asking for one 401s and used to bounce them to
    // the login page just for opening a profile.
    enabled: isAuthenticated && isScout,
  });

  // A scout gets one recommendation per player, so the panel has to know whether
  // this one is spent before it offers the button again.
  const { data: mine } = useQuery({
    queryKey: ['my-recommendation', playerId],
    queryFn: () =>
      browserFetch<MyRecommendation | null>(`/recommendations/player/${playerId}/mine`),
    enabled: isAuthenticated && activeRole === 'scout',
  });

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
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.player.actions}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Following is a scout's tool for keeping an eye on someone they have
              not recommended yet. A manager decides about players; they do not
              collect them. */}
          {isScout && (
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
            (mine ? (
              <RecommendationResult mine={mine} />
            ) : (
              <RecommendDialog playerId={playerId} playerName={playerName} />
            ))}

          {isManager && <ManagerAction playerId={playerId} />}
        </CardContent>
      </Card>

      {activeRole === 'coach' && (
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
function ManagerAction({ playerId }: { playerId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [coachUserId, setCoachUserId] = React.useState('');
  const [note, setNote] = React.useState('');

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
  });

  const invite = useMutation({
    mutationFn: () =>
      browserFetch(`/recommendations/players/${playerId}/invite`, {
        method: 'POST',
        body: { note: note.trim() },
      }),
    onSuccess: refresh,
  });

  if (isLoading) return <Skeleton className="h-11 w-full rounded-lg" />;
  if (!state) return null;

  if (state.recommendation?.status === 'ACCEPTED') {
    return (
      <p className="text-success flex items-center gap-1.5 text-sm">
        <Check className="size-4" aria-hidden /> {t.player.alreadyInvited}
      </p>
    );
  }

  const review = state.review;

  if (review?.status === 'PENDING') {
    return (
      <p className="text-muted text-sm">
        {t.recommendations.awaitingCoach}
        {review.coachUser.firstName
          ? ` — ${review.coachUser.firstName} ${review.coachUser.lastName ?? ''}`
          : ''}
      </p>
    );
  }

  if (review?.status === 'APPROVED') {
    return (
      <div className="space-y-2">
        <p className="text-success flex items-center gap-1.5 text-sm">
          <Check className="size-4" aria-hidden /> {t.recommendations.coachApproved}
        </p>
        <Field label={t.recommendations.inviteNote} htmlFor="invite-note">
          <Textarea
            id="invite-note"
            value={note}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t.placeholders.inviteNote}
          />
        </Field>
        <Button
          className="w-full"
          loading={invite.isPending}
          disabled={!note.trim()}
          onClick={() => invite.mutate()}
        >
          <Mail aria-hidden /> {t.recommendations.sendInvite}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {review?.status === 'REJECTED' && (
        <p className="text-muted text-xs">{t.recommendations.rejectedByCoach}</p>
      )}
      <Field label={t.recommendations.sendToCoach} htmlFor="review-coach">
        <Select
          id="review-coach"
          value={coachUserId}
          onChange={(event) => setCoachUserId(event.target.value)}
        >
          <option value="">{t.recommendations.anyCoach}</option>
          {(coaches.data ?? []).map((row) => (
            <option key={row.userId} value={row.userId}>
              {[row.user?.firstName, row.user?.lastName].filter(Boolean).join(' ') ||
                row.userId.slice(0, 8)}
            </option>
          ))}
        </Select>
      </Field>
      <Button className="w-full" loading={assign.isPending} onClick={() => assign.mutate()}>
        <Send aria-hidden /> {t.recommendations.sendForReview}
      </Button>
    </div>
  );
}

function RecommendDialog({ playerId, playerName }: { playerId: string; playerName: string }) {
  const { t } = useI18n();
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
    onSuccess: () => setOpen(false),
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
          {recommend.isError && <Alert tone="danger">{(recommend.error as Error).message}</Alert>}

          <Field label={t.recommendations.chooseAcademy} htmlFor="academyId" required>
            <Select
              id="academyId"
              value={academyId}
              onChange={(event) => setAcademyId(event.target.value)}
            >
              <option value="">{t.recommendations.globalType}</option>
              {endorsing?.map(({ academy }) => (
                <option key={academy.id} value={academy.id}>
                  {academy.name}
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
