import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

const CATEGORIES = ['DRIBBLING', 'PASSING', 'SHOOTING', 'SPRINT', 'MATCH_HIGHLIGHTS'] as const;
const TYPES = ['IMAGE', 'VIDEO'] as const;

export class RequestUploadDto {
  @IsString() filename: string;
  @IsIn(TYPES) type: (typeof TYPES)[number];
  @IsIn(CATEGORIES) category: (typeof CATEGORIES)[number];
}

export class ConfirmUploadDto {
  @IsString() storageKey: string;
  @IsIn(TYPES) type: (typeof TYPES)[number];
  @IsIn(CATEGORIES) category: (typeof CATEGORIES)[number];
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
