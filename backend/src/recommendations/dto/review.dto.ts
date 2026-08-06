import {
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

/** The manager's invitation, in the player's own notifications. */
export class InvitePlayerDto {
  /** The private trial to invite them to. It must be this academy's own. */
  @IsUUID() trialId: string;

  /** Where to be, when, what to bring — the invitation itself. */
  @IsString() @MinLength(1) @MaxLength(1000) note: string;
}
