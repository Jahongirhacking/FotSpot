import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaCategory } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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

  /**
   * Whether the browser already produced the optimised MP4.
   *
   * A hint, never a permission. Absent or false sends the clip to the server-side
   * transcoder, which is the safe direction — the cost of disbelieving a client
   * that did compress is one wasted re-encode, and the cost of believing one that
   * did not is a 40 MB original serving the feed for ever. An older client that
   * does not send the field lands on the safe side by omission.
   */
  @IsOptional() @IsBoolean() optimised?: boolean;
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

  /**
   * When the footage was taken — a bare `YYYY-MM-DD`, or a full timestamp.
   * Omitted means today. Anything after today in Asia/Tashkent is refused by
   * the service (see recorded-at.util), not only by the date picker.
   */
  @ApiPropertyOptional({ example: '2026-05-10' })
  @IsOptional()
  @IsISO8601()
  recordedAt?: string;

  /** Key of the cover frame, from the same upload ticket. Optional: capture can
   *  fail, and a clip without a cover beats a refused upload. */
  @IsOptional() @IsString() @MaxLength(512) posterKey?: string;
}

/**
 * What the uploader may correct on their own clip.
 *
 * ## The category is editable, with one rule
 *
 * It used to be absent here, on the argument that a clip's category is the bar
 * it argues for and a different bar is a different clip. In practice the
 * mistake this blocked was the ordinary one: a player films shooting, taps
 * "technique", and is stuck with a clip filed under the wrong skill that they
 * can only delete and re-upload. The footage is right; the label is wrong.
 *
 * The rule that survives: an attribute clip carries a rating and a highlights
 * clip does not. Moving onto an attribute needs a number — sent alongside, or
 * already on the row; moving to MATCH_HIGHLIGHTS drops it. Enforced in the
 * service, because it depends on the row's current state.
 */
export class UpdateMediaDto {
  @ApiPropertyOptional({ enum: MediaCategory, enumName: 'MediaCategory' })
  @IsOptional()
  @IsIn(CATEGORIES)
  category?: (typeof CATEGORIES)[number];

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

export class ListMediaCommentsDto extends PaginationDto {}
