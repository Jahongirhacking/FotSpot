'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import type {
  ApplicationStage,
  DominantFoot,
  PlayerProfile,
  TrialApplicationStatus,
} from '@/lib/api/types';
import { ageFrom, initials } from '@/lib/utils';
import * as React from 'react';
import { StageBadge } from './StageTabs';

/** The player as an applicant list returns them, photograph included. */
export interface ApplicantPlayer extends PlayerProfile {
  avatarUrl?: string | null;
}

/**
 * One applicant, as a football card rather than a table row.
 *
 * ## Why the player is the biggest thing on it
 *
 * Whoever works through a trial is answering one question per person — is this
 * player worth a place — and the thing that question is *about* is the player.
 * The old list put the trial's own details on every row beside the name, so the
 * same six words repeated down the page and the person got a line of grey text.
 * The trial is stated once, in the header above the grid; each card carries only
 * what distinguishes one applicant from the next: face, name, position, age,
 * gender, foot, and where they stand.
 *
 * ## What it deliberately does not decide
 *
 * Nothing. The actions are passed in, because who may act on an applicant
 * depends on who is looking: an assigned coach writes PASS or FAIL (TRIAL.md
 * §10), the manager places a passed player, and neither may do the other's
 * job. One card, several callers, no branch inside it that has to be kept in
 * step with the permission rules on the server.
 */
export function ApplicantCard({
  player,
  status,
  stage,
  detail,
  actions,
}: {
  player: ApplicantPlayer;
  status: TrialApplicationStatus;
  /** Where they stand in the academy's words, when the list knows it — drawn instead of the raw status. */
  stage?: ApplicationStage;
  /** One line under the identity — the verdict, or what is being waited on. */
  detail?: React.ReactNode;
  /** Whatever this viewer may do about this applicant, or nothing. */
  actions?: React.ReactNode;
}) {
  const { t, f } = useI18n();
  const name = `${player?.firstName ?? ''} ${player?.lastName ?? ''}`.trim();

  const positions = [player?.primaryPosition, player?.secondaryPosition]
    .filter(Boolean)
    .join(' · ');
  const age = player?.birthDate ? ageFrom(player.birthDate) : null;
  const gender = genderLabel(player?.gender, t);

  return (
    <li className="border-border flex flex-wrap items-center gap-x-4 gap-y-3 border-b p-3 last:border-b-0 sm:flex-nowrap">
      {/*
        A row, not a card in a grid.
        A coach works down a list of people deciding one thing about each, and a
        grid of tall cards makes that four faces per screen with the buttons in
        four different places. A row keeps the photograph — which is how they
        recognise somebody — and puts every name, every status and every button
        in the same column, so the eye travels straight down.
      */}
      <Avatar
        src={player?.avatarUrl}
        fallback={initials(player?.firstName, player?.lastName)}
        alt={name}
        className="size-14 shrink-0 rounded-lg text-base sm:size-16"
      />

      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate font-semibold" title={name}>
          {name}
        </p>
        <p className="text-muted truncate text-xs">
          {[
            positions || null,
            age !== null ? f(t.trials.ageYears, { age }) : null,
            gender,
            player?.dominantFoot ? footLabel(player.dominantFoot, t) : null,
          ]
            .filter(Boolean)
            .join(' · ') || '—'}
        </p>
        {detail}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {stage ? <StageBadge stage={stage} /> : <StatusBadge status={status} />}
      </div>

      {/*
        Full width on a phone so the buttons are thumb-sized; a fixed column on
        anything wider so they line up down the list.
      */}
      {actions && (
        <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:basis-56 sm:justify-end">
          {actions}
        </div>
      )}
    </li>
  );
}

function footLabel(foot: DominantFoot, t: ReturnType<typeof useI18n>['t']) {
  if (foot === 'LEFT') return t.player.footLeft;
  if (foot === 'RIGHT') return t.player.footRight;
  return t.player.footBoth;
}

/**
 * The player's gender, in the reader's words — or nothing for a value the
 * profile does not state, since "—" beside a name says less than silence.
 */
function genderLabel(gender: string | null | undefined, t: ReturnType<typeof useI18n>['t']) {
  const value = (gender ?? '').trim().toLowerCase();
  if (value === 'male') return t.trials.genderMale;
  if (value === 'female') return t.trials.genderFemale;
  return null;
}

/**
 * What is happening to this applicant, in a sentence — for every status.
 *
 * A card shows an action when this viewer has one, and this when they do not.
 * Exhaustive by type: `Record<TrialApplicationStatus, …>` means a new state
 * cannot be added to the domain without the compiler asking what the card
 * should say, which is how the blank rows happened — a status nobody had
 * written a line for rendered nothing at all, and a reader could not tell
 * "nothing to do" from "this failed to load".
 *
 * The sentences are written from the academy's side, because that is who reads
 * them: a manager and the coaches working the session.
 */
export function useApplicationStep(status: TrialApplicationStatus): string {
  const { t } = useI18n();

  const step: Record<TrialApplicationStatus, string> = {
    APPLIED: t.trials.stepApplied,
    INVITED: t.trials.stepInvited,
    CONFIRMED: t.trials.stepConfirmed,
    PASSED: t.trials.stepPassed,
    FAILED: t.trials.stepFailed,
    REJECTED: t.trials.stepRejected,
    ACCEPTED: t.trials.stepAccepted,
  };

  return step[status] ?? '';
}

/**
 * Where this applicant stands, in one word.
 *
 * The tones carry the meaning for anybody scanning rather than reading: a
 * settled good outcome is green, a settled bad one is red, and everything still
 * in motion is neutral. `PASSED` and `ACCEPTED` are both green because both are
 * a yes — one from the coach, one from the academy.
 */
export function StatusBadge({ status }: { status: TrialApplicationStatus }) {
  const { t } = useI18n();

  const variant =
    status === 'ACCEPTED' || status === 'PASSED'
      ? 'success'
      : status === 'REJECTED' || status === 'FAILED'
        ? 'danger'
        : status === 'INVITED' || status === 'CONFIRMED'
          ? 'warning'
          : 'neutral';

  const label: Record<TrialApplicationStatus, string> = {
    APPLIED: t.trials.statusApplied,
    INVITED: t.trials.statusInvited,
    CONFIRMED: t.trials.statusConfirmed,
    PASSED: t.trials.statusPassed,
    FAILED: t.trials.statusFailed,
    REJECTED: t.trials.statusRejected,
    ACCEPTED: t.trials.statusAccepted,
  };

  return <Badge variant={variant}>{label[status] ?? status}</Badge>;
}
