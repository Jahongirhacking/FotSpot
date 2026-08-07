import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Hand a recommendation to a coach.
 *
 * `coachUserId` is optional: a manager with six endorsed coaches often has no
 * opinion about which of them watches a given clip, and forcing a choice turns a
 * one-press action into a decision. Omitted means "any of them" — see
 * RecommendationsService.assignReview for how one is picked.
 */
export class AssignReviewDto {
  @IsOptional() @IsUUID() coachUserId?: string;
}

const ATTRIBUTE = { min: 0, max: 100 } as const;

/**
 * The coach's verdict, and the ratings they watched the clips to arrive at.
 *
 * Ratings are required on approval and optional on rejection: a coach saying no
 * has still watched the player and their numbers are worth recording, but making
 * them fill in eight fields to decline is how "reject" stops being used honestly.
 */
export class ReviewDecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';

  @IsOptional() @IsString() @MaxLength(1000) note?: string;

  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) speed?: number;
  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) passing?: number;
  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) vision?: number;
  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) dribbling?: number;
  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) finishing?: number;
  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) physical?: number;
  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) leadership?: number;
  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) discipline?: number;
}

/**
 * The manager's invitation to a private trial, in the player's own notifications.
 *
 * There is no `trialId`, deliberately. A private trial is not a thing that
 * exists first and gets filled: it is a session for one named child, brought
 * into being by this invitation and by nothing else (TRIAL.md §18). Asking the
 * manager to pick one from a list meant creating an empty private trial first
 * and hoping somebody eventually earned it — which is why the button used to
 * read "no private trial to invite them to".
 *
 * So what the manager supplies is what an invitation actually needs: when,
 * where, and what to bring. The trial is created around them.
 */
export class InvitePlayerDto {
  /** When to come. The trial is created for this moment. */
  @IsDateString() date: string;

  /** Where to come. */
  @IsString() @MinLength(1) @MaxLength(200) location: string;

  /** What to bring, and anything else the family needs — the invitation itself. */
  @IsString() @MinLength(1) @MaxLength(1000) note: string;
}
