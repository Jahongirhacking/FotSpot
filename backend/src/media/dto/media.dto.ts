import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaCategory } from '@prisma/client';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** The six card attributes a clip can evidence, plus highlights (§21.1). */
const CATEGORIES = [
  'PACE',
  'DRIBBLING',
  'PASSING',
  'FINISHING',
  'PHYSICAL',
  'TECHNIQUE',
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
   * Required for the six attribute categories and rejected for
   * MATCH_HIGHLIGHTS — enforced in the service, because "required unless the
   * value of another field is X" is not something class-validator states
   * clearly enough to be worth the custom constraint.
   */
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  selfRating?: number;

  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

export class ListPlayerMediaDto {
  @ApiPropertyOptional({ enum: MediaCategory, enumName: 'MediaCategory' })
  @IsOptional()
  @IsIn(CATEGORIES)
  category?: (typeof CATEGORIES)[number];
}

export class CreateMediaCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body: string;
}

export class ListMediaCommentsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}
