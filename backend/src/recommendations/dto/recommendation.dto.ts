import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RecommendationType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
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

const STATUSES = ['REVIEWING', 'ACCEPTED', 'REJECTED'] as const;

export class UpdateRecommendationStatusDto {
  @IsIn(STATUSES) status: (typeof STATUSES)[number];

  /**
   * Which academy is deciding. Required when the caller manages more than one, so
   * a verdict is never written to the wrong academy's target row.
   */
  @IsOptional() @IsUUID() academyId?: string;
}
