import type {
  InvitationStatus,
  TrialApplicationStatus,
  TrialType,
  TrialVerdict,
} from '@prisma/client';

/**
 * Where an applicant stands, in the seven words the academy reads
 * (TRIAL.md §32): the application's own status is not enough on its own, because
 * the two things that happen after a PASS — the manager's decision and the
 * player's answer to the squad invitation — are written elsewhere.
 *
 * - `PENDING`             applied, invited or confirmed; waiting on the coach
 * - `FAILED`              the coach said no
 * - `PASSED`              the coach said yes; waiting on the manager
 * - `CANDIDACY_CLOSED`    the manager closed the candidacy, or withdrew
 * - `SQUAD_INVITED`       the manager offered a squad place; waiting on the player
 * - `INVITATION_DECLINED` the player said no — to the squad, or to the private trial
 * - `SQUAD_JOINED`        the player accepted and is on the academy's books
 */
export type ApplicationStage =
  | 'PENDING'
  | 'FAILED'
  | 'PASSED'
  | 'CANDIDACY_CLOSED'
  | 'SQUAD_INVITED'
  | 'INVITATION_DECLINED'
  | 'SQUAD_JOINED';

export const APPLICATION_STAGES: readonly ApplicationStage[] = [
  'PENDING',
  'FAILED',
  'PASSED',
  'CANDIDACY_CLOSED',
  'SQUAD_INVITED',
  'INVITATION_DECLINED',
  'SQUAD_JOINED',
];

/**
 * The statuses each stage is read from. The first three are exact; the four
 * after a PASS share a status and are told apart by `applicationStage`.
 */
export const STAGE_STATUSES: Record<ApplicationStage, readonly TrialApplicationStatus[]> = {
  PENDING: ['APPLIED', 'INVITED', 'CONFIRMED'],
  FAILED: ['FAILED'],
  PASSED: ['PASSED'],
  CANDIDACY_CLOSED: ['REJECTED', 'ACCEPTED'],
  SQUAD_INVITED: ['ACCEPTED'],
  INVITATION_DECLINED: ['REJECTED', 'ACCEPTED'],
  SQUAD_JOINED: ['ACCEPTED'],
};

/**
 * Everything but a closed application: the player is still in an academy's
 * hands — applied, invited, confirmed, passed and waiting, or offered a place.
 * What blocks a scout's recommendation, and what opens a player's contacts to
 * that academy's manager.
 */
export const OPEN_APPLICATION_STATUSES: readonly TrialApplicationStatus[] = [
  'APPLIED',
  'INVITED',
  'CONFIRMED',
  'PASSED',
  'ACCEPTED',
];

/** The stages a status decides on its own — pageable in the database. */
export const STATUS_STAGES: ReadonlySet<ApplicationStage> = new Set([
  'PENDING',
  'FAILED',
  'PASSED',
]);

export interface StageInput {
  status: TrialApplicationStatus;
  trialType: TrialType;
  /** The coach's verdict, when one was recorded. */
  verdict: TrialVerdict | null;
  /** The squad invitation that followed the pass, when the manager sent one. */
  squadInvitation: { status: InvitationStatus } | null;
  /** Whether the player is on the academy's books right now. */
  member: boolean;
}

export function applicationStage(input: StageInput): ApplicationStage {
  switch (input.status) {
    case 'APPLIED':
    case 'INVITED':
    case 'CONFIRMED':
      return 'PENDING';
    case 'FAILED':
      return 'FAILED';
    case 'PASSED':
      return 'PASSED';
    case 'REJECTED':
      /*
       * A no without a verdict on a private trial is the player's: they were
       * invited and declined. With a verdict, or on a global trial, it is the
       * academy's — the candidacy closed, or the interest withdrawn.
       */
      return input.verdict === null && input.trialType === 'PRIVATE'
        ? 'INVITATION_DECLINED'
        : 'CANDIDACY_CLOSED';
    case 'ACCEPTED': {
      // The membership is the fact; the invitation is how it came about.
      if (input.member) return 'SQUAD_JOINED';
      switch (input.squadInvitation?.status) {
        case 'ACCEPTED':
          return 'SQUAD_JOINED';
        case 'REJECTED':
          return 'INVITATION_DECLINED';
        case 'CANCELLED':
          return 'CANDIDACY_CLOSED';
        default:
          return 'SQUAD_INVITED';
      }
    }
  }
}
