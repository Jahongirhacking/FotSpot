import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanTier } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * An upper bound on every limit, not only a lower one.
 *
 * Without it a slipped keypress turns a plan into "one million clips a week",
 * which reads as a working limit on the admin screen and is really no limit at
 * all. Ten thousand is far beyond any plan anyone will sell and still small
 * enough that a wrong number looks wrong.
 */
const MAX_LIMIT = 10_000;

/**
 * A partial edit: only the numbers the admin actually changed are sent.
 *
 * Every field is optional so that saving one row does not depend on the screen
 * echoing back the other four correctly — a form that must resend everything is
 * a form that overwrites a colleague's edit made a second earlier.
 */
export class UpdateTariffPlanDto {
  /** A — clips a player may upload per window. */
  @ApiPropertyOptional({ minimum: 0, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_LIMIT)
  clipLimit?: number;

  /** B — the length of that window, in days. At least one; a zero-day window
   *  would refuse every upload forever. */
  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  clipWindowDays?: number;

  /** C — recommendations a scout may have awaiting a verdict at once. */
  @ApiPropertyOptional({ minimum: 0, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_LIMIT)
  pendingRecommendationLimit?: number;

  /** D — coaches an academy manager may create. */
  @ApiPropertyOptional({ minimum: 0, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_LIMIT)
  maxCoaches?: number;

  /** E — squad groups an academy manager may create. */
  @ApiPropertyOptional({ minimum: 0, maximum: MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_LIMIT)
  maxGroups?: number;
}

/** Super-admin only: move one account onto another tier. */
export class SetUserPlanDto {
  @ApiProperty({ enum: PlanTier, enumName: 'PlanTier' })
  @IsEnum(PlanTier)
  tier: PlanTier;
}
