import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaCategory } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** The card attributes a clip can evidence, plus highlights (§21.1). */
const CATEGORIES = [
  'PACE',
  'DRIBBLING',
  'PASSING',
  'FINISHING',
  'PHYSICAL',
  'TECHNIQUE',
  'GOALKEEPING',
  'MATCH_HIGHLIGHTS',
] as const;
const TYPES = ['IMAGE', 'VIDEO'] as const;

export class RequestUploadDto {
  @IsString() filename: string;
  @IsIn(TYPES) type: (typeof TYPES)[number];
  @ApiProperty({ enum: MediaCategory, enumName: 'MediaCategory' })
  @IsIn(CATEGORIES)
  category: (typeof CATEGORIES)[number];

  /** Sent to R2 so the object is served back with the right type. */
  @IsOptional() @IsString() @MaxLength(100) contentType?: string;
}

export class ConfirmUploadDto {
  @IsString() storageKey: string;
  @IsIn(TYPES) type: (typeof TYPES)[number];
  @ApiProperty({ enum: MediaCategory, enumName: 'MediaCategory' })
  @IsIn(CATEGORIES)
  category: (typeof CATEGORIES)[number];

  /**
   * The player's own 0–100 claim for this attribute, evidenced by the clip.
   *
   * Required for every attribute category and rejected for MATCH_HIGHLIGHTS — enforced in the service, because "required unless the
   * value of another field is X" is not something class-validator states
   * clearly enough to be worth the custom constraint.
   */
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  rating?: number;

  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;

  /** Key of the cover frame, from the same upload ticket. Optional: capture can
   *  fail, and a clip without a cover beats a refused upload. */
  @IsOptional() @IsString() @MaxLength(512) posterKey?: string;
}

/**
 * Owner edits after the fact.
 *
 * The category is deliberately absent. A clip's category is the bar it argues
 * for, so re-pointing an old clip at a different attribute would rewrite a claim
 * history the chart has already drawn. Delete and re-upload instead — that leaves
 * an honest record.
 */
export class UpdateMediaDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  rating?: number;
}

/**
 * A coach replacing the rating on a clip they have watched.
 *
 * Separate from UpdateMediaDto because it is a different act by a different
 * person: the player edits their own claim, a coach overrules it. One endpoint
 * taking both would need the caller's role to decide what the same field means.
 */
export class RateMediaDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  rating: number;
}

/**
 * A page of one player's clips, optionally narrowed to a single attribute.
 *
 * Paginated because a clip list only grows: the tariff bounds how fast a player
 * may upload, not how many they end up with, and every earlier claim is kept on
 * purpose so an attribute bar has a history rather than a value.
 */
export class ListPlayerMediaDto extends PaginationDto {
  @ApiPropertyOptional({ enum: MediaCategory, enumName: 'MediaCategory' })
  @IsOptional()
  @IsIn(CATEGORIES)
  category?: (typeof CATEGORIES)[number];
}

/** A page of the ranked feed. Offset paging, because the ranking is a score
 *  rather than a cursorable column — see MediaService.feed. */
export class FeedDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  pageSize?: number;
}

export class CreateMediaCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body: string;
}

export class ListMediaCommentsDto extends PaginationDto {
}
