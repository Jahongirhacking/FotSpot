import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RecommendationType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Filing a recommendation — README 1.5.3.
 *
 * `type` decides what else is required:
 *
 *   GLOBAL   — no academy. "Worth looking at", addressed to nobody. Any scout may
 *              file one; it raises the player's public weight only.
 *   SPECIFIC — `academyIds` is required, and every academy in it must currently
 *              endorse the caller. Carries extra weight for those academies.
 */
export class CreateRecommendationDto {
  @IsUUID() playerId: string;

  @ApiProperty({ enum: RecommendationType, enumName: 'RecommendationType' })
  @IsEnum(RecommendationType)
  type: RecommendationType;

  /**
   * Required for SPECIFIC, rejected for GLOBAL — a cross-field rule, so it is
   * enforced in the service alongside the endorsement check rather than split
   * across two places.
   *
   * Capped at 5: a "specific" recommendation addressed to every academy on the
   * platform is a global one wearing a disguise.
   */
  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  academyIds?: string[];

  @IsOptional() @IsString() note?: string;
}

const STATUSES = ['ACCEPTED', 'REJECTED'] as const;

export class UpdateRecommendationStatusDto {
  @IsIn(STATUSES) status: (typeof STATUSES)[number];

  /**
   * Which academy is deciding. Required when the caller manages more than one, so
   * a verdict is never written to the wrong academy's target row.
   */
  @IsOptional() @IsUUID() academyId?: string;
}

/**
 * A private trial invitation — one player, one date, one coach.
 *
 * Sent by an academy manager or an academy coach, from the player's profile or
 * the inbox (TRIAL.md §6–§9). A manager names the coach who will run it; a
 * coach who invites runs it themselves, so `coachUserId` is ignored for them.
 * `recommendationId` is the inbox's: the recommendation this invitation
 * answers, so the scout behind it is settled by the verdict.
 */
export class InvitePlayerDto {
  /** When to come — the day of the trial. */
  @IsDateString() date: string;

  /** Kick-off, `HH:MM`, when the family should know one. */
  @ApiPropertyOptional({ example: '10:30' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  /** Where to come. */
  @IsString() @MinLength(1) @MaxLength(200) location: string;

  /** What to bring, and anything else the family needs — the invitation itself. */
  @IsOptional() @IsString() @MaxLength(1000) note?: string;

  /** Requirements the player must meet or bring on the day. */
  @IsOptional() @IsString() @MaxLength(2000) requirements?: string;

  /** The coach who will run the trial and record its verdict. Managers only. */
  @IsOptional() @IsUUID('4') coachUserId?: string;

  /** The recommendation this invitation answers, when it answers one. */
  @IsOptional() @IsUUID('4') recommendationId?: string;
}
