'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, UserPlus, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { PendingAction } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { ageFrom, formatDate, initials } from '@/lib/utils';

/**
 * A passed player waiting on the manager, and the two things to do about them.
 *
 * ## Two answers, and only these two
 *
 * A pass makes the player a squad candidate; it is not yet anybody's decision
 * about the squad. The manager either **invites** them — an `AcademyInvitation`
 * the player still has to accept — or **closes the candidacy**, which is the
 * "x": a coach's thumb on one morning can be an accident, and this is the
 * manager saying so, with a note if they want one.
 *
 * Both are the events that answer the scouts who recommended the player
 * (TRIAL.md §23): the invitation settles them as right, the closed candidacy
 * as wrong, and either clears the player's live recommendations. The pass on
 * its own moves nobody's record, which is why the card offers a way back.
 *
 * ## One card, three screens
 *
 * The dashboard's "Waiting on you", the candidates page behind its "See all",
 * and the applicant list on the trial itself all act on the same application
 * row through the same two endpoints. One component, so the three cannot
 * drift apart.
 */
export function CandidateCard({
  item,
  inviting,
  cancelling,
  onInvite,
  onCancel,
}: {
  item: PendingAction;
  inviting: boolean;
  cancelling: boolean;
  onInvite: () => void;
  onCancel: (note?: string) => void;
}) {
  const { t, f } = useI18n();
  const player = item?.player;
  const age = player?.birthDate ? ageFrom(player.birthDate) : null;
  const gender = genderLabel(player?.gender, t);

  return (
    <li className="border-border bg-surface-2 flex min-w-0 flex-col gap-3 rounded-xl border p-4">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar
          src={player?.avatarUrl ?? null}
          fallback={initials(player?.firstName, player?.lastName)}
          alt=""
          className="size-14 shrink-0 rounded-lg text-base"
        />
        <div className="min-w-0 flex-1">
          <Link
            href={`/players/${item?.playerId}`}
            className="block truncate font-semibold hover:underline"
          >
            {player?.firstName} {player?.lastName}
          </Link>
          <p className="text-muted truncate text-xs">
            {[age !== null ? f(t.trials.ageYears, { age }) : null, player?.primaryPosition, gender]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {/* The exact date and where they live: the manager's to know. The
              address joins from `sm` up — on a phone the card keeps to what
              decides the invitation, and the profile is one tap away. */}
          <p className="text-muted truncate text-xs">
            {player?.birthDate ? formatDate(player.birthDate) : null}
            {player?.birthDate && (player?.district || player?.region) && (
              <span className="hidden sm:inline"> · </span>
            )}
            <span className="hidden sm:inline">
              {[player?.district, player?.region].filter(Boolean).join(', ')}
            </span>
          </p>
        </div>
      </div>

      <p className="text-success flex min-w-0 items-center gap-1.5 text-xs font-medium">
        <Check className="size-3.5 shrink-0" aria-hidden />
        <Link href={`/trials/${item?.trial?.id}`} className="min-w-0 truncate hover:underline">
          {t.dashboard.passedTrial} · {item?.trial?.title}
        </Link>
      </p>

      <div className="mt-auto">
        <CandidateActions
          playerName={`${player?.firstName ?? ''} ${player?.lastName ?? ''}`.trim()}
          inviting={inviting}
          cancelling={cancelling}
          onInvite={onInvite}
          onCancel={onCancel}
        />
      </div>
    </li>
  );
}

/**
 * The invitation and the "x", side by side. Separate from the card so the
 * trial's own applicant list — which draws the player its own way — offers
 * the same two answers.
 */
export function CandidateActions({
  playerName,
  inviting,
  cancelling,
  onInvite,
  onCancel,
}: {
  playerName: string;
  inviting: boolean;
  cancelling: boolean;
  onInvite: () => void;
  onCancel: (note?: string) => void;
}) {
  const { t } = useI18n();
  const [closing, setClosing] = React.useState(false);

  return (
    <>
      <div className="flex w-full items-center gap-1.5">
        {/*
          The button says "Invite to squad" because that is what it does: it
          sends an invitation the player has to accept, and nobody is placed
          by pressing it.
        */}
        <Button
          size="sm"
          className="min-w-0 flex-1"
          loading={inviting}
          disabled={cancelling}
          onClick={onInvite}
        >
          <UserPlus aria-hidden /> {t.trials.addToSquad}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 px-2"
          aria-label={t.trials.closeCandidacy}
          title={t.trials.closeCandidacy}
          loading={cancelling}
          disabled={inviting}
          onClick={() => setClosing(true)}
        >
          <X className="text-danger" aria-hidden />
        </Button>
      </div>

      <CancelCandidacyDialog
        open={closing}
        playerName={playerName}
        pending={cancelling}
        onOpenChange={setClosing}
        onConfirm={(note) => {
          setClosing(false);
          onCancel(note);
        }}
      />
    </>
  );
}

/**
 * "Close this candidacy?" — asks once, because it answers every scout who put
 * this player forward and tells the player. The note is optional and the
 * dialog says so: a manager passing on somebody honestly must stay cheap.
 */
export function CancelCandidacyDialog({
  open,
  playerName,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  playerName: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note?: string) => void;
}) {
  const { t, f } = useI18n();
  const [note, setNote] = React.useState('');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setNote('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.trials.closeCandidacyTitle}</DialogTitle>
          <DialogDescription>
            {f(t.trials.closeCandidacyBody, { name: playerName })}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Field label={t.trials.verdictNoteOptional} htmlFor="close-candidacy-note">
            <Textarea
              id="close-candidacy-note"
              value={note}
              rows={3}
              maxLength={500}
              autoFocus
              onChange={(event) => setNote(event.target.value)}
              placeholder={t.trials.closeCandidacyPlaceholder}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() => {
              const trimmed = note.trim();
              setNote('');
              onConfirm(trimmed || undefined);
            }}
          >
            <X aria-hidden /> {t.trials.closeCandidacy}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The two mutations behind the card, wherever it is drawn.
 *
 * Both change what the *server* rendered elsewhere — the squad, the trial's
 * applicant list, the dashboard's count — so every list that shows this
 * application is invalidated and the route is refreshed, not only the list
 * the click came from.
 */
export function useCandidateActions() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();

  const settled = () => {
    void queryClient.invalidateQueries({ queryKey: ['manager-pending-actions'] });
    void queryClient.invalidateQueries({ queryKey: ['trial-applications'] });
    void queryClient.invalidateQueries({ queryKey: ['roster'] });
    router.refresh();
  };

  const invite = useMutation({
    mutationFn: (applicationId: string) =>
      browserFetch(`/trials/applications/${applicationId}/squad`, { method: 'POST' }),
    onSuccess: settled,
    meta: { success: t.trials.addedToSquadDone },
  });

  const cancel = useMutation({
    mutationFn: ({ applicationId, note }: { applicationId: string; note?: string }) =>
      browserFetch(`/trials/applications/${applicationId}/status`, {
        method: 'PATCH',
        body: { status: 'REJECTED', ...(note ? { note } : {}) },
      }),
    onSuccess: settled,
    meta: { success: t.trials.candidacyClosed },
  });

  return {
    invite,
    cancel,
    /** Whether a given application is the one being acted on right now. */
    inviting: (applicationId: string) => invite.isPending && invite.variables === applicationId,
    cancelling: (applicationId: string) =>
      cancel.isPending && cancel.variables?.applicationId === applicationId,
    error: (invite.error ?? cancel.error) as Error | null,
  };
}

/** The player's gender in the reader's words, or nothing for a value not stated. */
function genderLabel(gender: string | null | undefined, t: ReturnType<typeof useI18n>['t']) {
  const value = (gender ?? '').trim().toLowerCase();
  if (value === 'male') return t.trials.genderMale;
  if (value === 'female') return t.trials.genderFemale;
  return null;
}
