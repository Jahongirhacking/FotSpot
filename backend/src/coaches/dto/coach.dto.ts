import { IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateCoachProfileDto {
  @IsOptional() @IsString() bio?: string;
}

/**
 * A coach scores a player in their own group — the only attribute path there is
 * (README §1.9, TRIAL.md Rules 21–22).
 *
 * **0–100, not 1–10.** These columns are read on a 0–100 scale everywhere that
 * consumes them: `card-stars.util.ts` divides by 600 for six attributes, the
 * §21.2 bars render percentages, and a clip's coach rating is already 0–100. The
 * DTO said 1–10, which meant a perfect assessment scored 60/600 and drew an
 * empty card. It is the one path left that writes these rows, so the scale it
 * accepts is now the scale of the whole system.
 */
export class CreateAssessmentDto {
  @IsUUID() playerId: string;

  @IsInt() @Min(0) @Max(100) speed: number;
  @IsInt() @Min(0) @Max(100) passing: number;
  @IsInt() @Min(0) @Max(100) vision: number;
  @IsInt() @Min(0) @Max(100) dribbling: number;
  @IsInt() @Min(0) @Max(100) finishing: number;
  @IsInt() @Min(0) @Max(100) physical: number;
  @IsInt() @Min(0) @Max(100) leadership: number;
  @IsInt() @Min(0) @Max(100) discipline: number;

  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) mediaUrls?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) documentUrls?: string[];
}

/** Academy manager takes on a coach (README §1.9, revised). */
export class CreateCoachForAcademyDto {
  @IsUUID() userId: string;
  @IsOptional() @IsString() @MaxLength(1000) bio?: string;
}
