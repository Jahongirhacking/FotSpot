import { ApiPropertyOptional } from '@nestjs/swagger';
import { BlogPostStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The public listing: one page, optionally narrowed to a category or a search. */
export class ListPostsDto extends PaginationDto {
  /** A category slug. */
  @IsOptional() @IsString() @MaxLength(90) category?: string;
  /** Free text over title and excerpt. */
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  /** `latest` (default) or `top` — most liked first. */
  @IsOptional() @IsIn(['latest', 'top']) sort?: 'latest' | 'top';
}

export class AdminListPostsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: BlogPostStatus, enumName: 'BlogPostStatus' })
  @IsOptional()
  @IsEnum(BlogPostStatus)
  status?: BlogPostStatus;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
}

/**
 * Everything an admin writes on a post. All optional on update; `title`,
 * `excerpt` and `content` are required to create. `slug` is generated from
 * the title when absent and never rewritten afterwards — an admin who wants
 * a different address sends one.
 */
export class SavePostDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(160) title?: string;
  @IsOptional() @IsString() @Matches(SLUG_PATTERN) @MaxLength(90) slug?: string;
  @IsOptional() @IsString() @MaxLength(400) excerpt?: string;
  @IsOptional() @IsString() @MaxLength(60_000) content?: string;
  /** An R2 key under `public/blog/`, from `cover/upload-url`; empty string clears. */
  @IsOptional() @IsString() @MaxLength(300) coverKey?: string;
  @IsOptional() @IsString() @MaxLength(200) coverAlt?: string;
  /** A category id; empty string clears. */
  @IsOptional() @IsString() @MaxLength(60) categoryId?: string;
  @IsOptional() @IsString() @MaxLength(80) authorName?: string;
  /** Overrides the computed reading time; 0 or absent recomputes. */
  @IsOptional() @IsInt() @Min(0) @Max(120) readingMinutes?: number;
  @IsOptional() @IsBoolean() featured?: boolean;

  // SEO
  @IsOptional() @IsString() @MaxLength(70) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(170) metaDescription?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  seoKeywords?: string[];
  @IsOptional() @IsString() @MaxLength(300) canonicalUrl?: string;
  @IsOptional() @IsString() @MaxLength(90) ogTitle?: string;
  @IsOptional() @IsString() @MaxLength(200) ogDescription?: string;
  /** An R2 key under `public/blog/`; empty string clears. */
  @IsOptional() @IsString() @MaxLength(300) ogImageKey?: string;
}

export class SaveCategoryDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @IsString() @Matches(SLUG_PATTERN) @MaxLength(60) slug?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

export class BlogImageUploadDto {
  @IsString() @MinLength(1) @MaxLength(200) filename: string;
  /** Which picture: the post's cover (default) or its share image. */
  @IsOptional() @IsIn(['cover', 'og']) purpose?: 'cover' | 'og';
}
