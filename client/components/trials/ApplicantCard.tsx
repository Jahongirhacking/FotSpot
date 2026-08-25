'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import type { DominantFoot, PlayerProfile, TrialApplicationStatus } from '@/lib/api/types';
import { ageFrom, initials } from '@/lib/utils';
import * as React from 'react';

/** The player as an applicant list returns them, photograph included. */
export interface ApplicantPlayer extends PlayerProfile {
  avatarUrl?: string | null;
}

/**
 * One applicant, as a football card rather than a table row.
 *
 * ## Why the player is the biggest thing on it
 *
 * A coach working through a trial is answering one question per person — is this
 * player worth a place — and the thing that question is *about* is the player.
 * The old list put the trial's own details on every row beside the name, so the
 * same six words repeated down the page and the person got a line of grey text.
 * The trial is stated once, in the header above the grid; each card carries only
 * what distinguishes one applicant from the next: face, name, position, age,
 * foot, and where they stand.
 *
 * ## What it deliberately does not decide
 *
 * Nothing. The actions are passed in, because who may act on an applicant
 * depends on who is looking: a coach writes PASS or FAIL (TRIAL.md Rule 7), a
 * manager invites or places, and neither may do the other's job (Rule 16). One
 * card, two callers, no branch inside it that has to be kept in step with the
 * permission rules on the server.
 */
export function ApplicantCard({
  player,
  status,
  detail,
  actions,
}: {
  player: ApplicantPlayer;
  status: TrialApplicationStatus;
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

  return (
    <li className="border-border bg-surface-2 flex flex-col overflow-hidden rounded-xl border">
      {/*
        The face, at the top and large. A 4:3 block rather than a circle: a
        squad-sheet photograph is what a coach recognises somebody by, and a
        32px avatar in a row is not that. The Avatar primitive supplies the
        initials fallback for the many players with no photo yet.
      */}
      <div className="bg-surface-3 relative aspect-[4/3] w-full">
        <Avatar
          src={player?.avatarUrl}
          fallback={initials(player?.firstName, player?.lastName)}
          alt={name}
          className="absolute inset-0 size-full rounded-none text-2xl"
        />
        <div className="absolute top-2 right-2">
          <StatusBadge status={status} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate font-semibold" title={name}>
            {name}
          </p>
          <p className="text-muted truncate text-xs">{positions || '—'}</p>
        </div>

        <p className="text-muted text-xs">
          {[
            age !== null ? f(t.trials.ageYears, { age }) : null,
            player?.dominantFoot ? footLabel(player.dominantFoot, t) : null,
          ]
            .filter(Boolean)
            .join(' · ') || '—'}
        </p>

        {detail}

        {/* Pushed to the bottom so every card in a row ends with its buttons on
            the same line, however long the names above them are. */}
        {actions && <div className="mt-auto flex flex-wrap gap-2 pt-1">{actions}</div>}
      </div>
    </li>
  );
}

function footLabel(foot: DominantFoot, t: ReturnType<typeof useI18n>['t']) {
  if (foot === 'LEFT') return t.player.footLeft;
  if (foot === 'RIGHT') return t.player.footRight;
  return t.player.footBoth;
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
    SCREENING: t.trials.stepScreening,
    SHORTLISTED: t.trials.stepShortlisted,
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
        : status === 'INVITED' || status === 'SHORTLISTED' || status === 'CONFIRMED'
          ? 'warning'
          : 'neutral';

  const label: Record<TrialApplicationStatus, string> = {
    APPLIED: t.trials.statusApplied,
    SCREENING: t.trials.statusScreening,
    SHORTLISTED: t.trials.statusShortlisted,
    INVITED: t.trials.statusInvited,
    CONFIRMED: t.trials.statusConfirmed,
    PASSED: t.trials.statusPassed,
    FAILED: t.trials.statusFailed,
    REJECTED: t.trials.statusRejected,
    ACCEPTED: t.trials.statusAccepted,
  };

  return <Badge variant={variant}>{label[status] ?? status}</Badge>;
}
