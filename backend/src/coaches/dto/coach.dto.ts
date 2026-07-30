import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCoachProfileDto {
  @IsOptional() @IsString() bio?: string;
}

export class CreateAssessmentDto {
  @IsUUID() playerId: string;

  @IsInt() @Min(1) @Max(10) speed: number;
  @IsInt() @Min(1) @Max(10) passing: number;
  @IsInt() @Min(1) @Max(10) vision: number;
  @IsInt() @Min(1) @Max(10) dribbling: number;
  @IsInt() @Min(1) @Max(10) finishing: number;
  @IsInt() @Min(1) @Max(10) physical: number;
  @IsInt() @Min(1) @Max(10) leadership: number;
  @IsInt() @Min(1) @Max(10) discipline: number;

  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) mediaUrls?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) documentUrls?: string[];
}

/** Academy manager takes on a coach (README §1.9, revised). */
export class CreateCoachForAcademyDto {
  @IsUUID() userId: string;
  @IsOptional() @IsString() @MaxLength(1000) bio?: string;
}
