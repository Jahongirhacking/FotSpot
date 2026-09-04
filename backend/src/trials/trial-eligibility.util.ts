import { BadRequestException } from '@nestjs/common';

/**
 * Who a trial is for, by gender — the one rule every way of putting a player
 * on a trial has to agree on.
 *
 * ## Why it lives here and not in a controller
 *
 * An application row is created in two places: a player applying to an open
 * trial (`TrialsService.apply`) and a manager inviting a player to a private
 * one (`RecommendationsService.invitePlayer`). A check on one route is a rule
 * with a back door. Both call this, so a female-only trial refuses a male
 * applicant whichever way he arrives, and there is one sentence to change if
 * the wording ever does.
 *
 * ## Vocabulary
 *
 * A trial's gender is `male`, `female` or `general` (validated at the edge —
 * see CreateTrialDto). A profile's gender is a free string the player supplied,
 * so it is compared case-insensitively and trimmed. A trial that says anything
 * other than `male` or `female` is open to everybody: `general` by design, and
 * an unrecognised value by choice, because refusing every applicant over a
 * value nobody can see would be the worse failure.
 */
export type TrialGender = 'male' | 'female' | 'general';

const normalise = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

/** Whether a player of `playerGender` may take part in a trial of `trialGender`. */
export function isGenderEligible(
  trialGender: string | null | undefined,
  playerGender: string | null | undefined,
): boolean {
  const trial = normalise(trialGender);
  if (trial !== 'male' && trial !== 'female') return true;
  return normalise(playerGender) === trial;
}

/** What the refused player reads. */
export function genderIneligibilityMessage(trialGender: string): string {
  return `This trial is for ${normalise(trialGender)} players only.`;
}

/**
 * Refuses, as the rest of the application flow refuses an ineligible player —
 * a 400 with a sentence they can act on, the same shape as the age-range check.
 * Runs before anything is written, so a refusal leaves no row and no message.
 */
export function assertGenderEligible(
  trial: { gender: string | null | undefined },
  player: { gender: string | null | undefined },
): void {
  if (!isGenderEligible(trial.gender, player.gender)) {
    throw new BadRequestException(genderIneligibilityMessage(trial.gender ?? ''));
  }
}
