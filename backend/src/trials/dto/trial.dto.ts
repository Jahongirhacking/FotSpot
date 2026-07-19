import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTrialDto {
  @IsString() title: string;

  @Type(() => Number) @IsInt() @Min(0) ageRangeMin: number;
  @Type(() => Number) @IsInt() @Min(0) ageRangeMax: number;

  @IsArray() @IsString({ each: true }) positions: string[];
  @IsString() location: string;
  @IsDateString() date: string;
  @IsOptional() @IsString() requirements?: string;
}

const APPLICATION_STATUSES = ['SHORTLISTED', 'INVITED', 'REJECTED', 'ACCEPTED'] as const;

export class UpdateTrialApplicationStatusDto {
  @IsIn(APPLICATION_STATUSES) status: (typeof APPLICATION_STATUSES)[number];
}
