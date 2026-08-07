import { ApiPropertyOptional } from '@nestjs/swagger';
import { TrialStatus, TrialType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTrialDto {
  @IsString() title: string;

  /** GENERAL is the open day; PRIVATE is a session for players the academy picks. */
  @ApiPropertyOptional({ enum: TrialType, enumName: 'TrialType' })
  @IsOptional()
  @IsEnum(TrialType)
  type?: TrialType;

  @Type(() => Number) @IsInt() @Min(0) ageRangeMin: number;
  @Type(() => Number) @IsInt() @Min(0) ageRangeMax: number;

  @IsArray() @IsString({ each: true }) positions: string[];
  @IsString() location: string;

  /** When the examination happens — the day the player is tested. */
  @IsDateString() date: string;

  /**
   * Last moment somebody may apply. Must not be after the exam.
   *
   * Required on creation even though the column is nullable: the null is only
   * for trials written before deadlines existed, and a new trial without one is
   * a list nobody can close.
   */
  @IsDateString() applyDeadline: string;

  @IsOptional() @IsString() requirements?: string;

  /**
   * What the player reads, as HTML from the note editor.
   *
   * Sanitised server-side before it is stored (`sanitizeRichText`) — the
   * client sanitises too, but anybody can post here without loading the client.
   */
  @IsOptional() @IsString() @MaxLength(20_000) note?: string;
}

/**
 * Editing a trial that is already published.
 *
 * Every field is optional and every field is editable, including the date: a
 * venue that falls through the week before is the ordinary case, and a manager
 * whose only recourse is a second trial leaves the first one collecting
 * applications for a session nobody will run.
 */
export class UpdateTrialDto {
  @IsOptional() @IsString() title?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) ageRangeMin?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) ageRangeMax?: number;

  @IsOptional() @IsArray() @IsString({ each: true }) positions?: string[];
  @IsOptional() @IsString() location?: string;

  /**
   * Moving this notifies every applicant — see `TrialsService.update`.
   *
   * A venue that falls through the week before is the ordinary case, and a
   * manager whose only recourse is a second trial leaves the first collecting
   * applications for a session nobody will run.
   */
  @IsOptional() @IsDateString() date?: string;

  @IsOptional() @IsDateString() applyDeadline?: string;
  @IsOptional() @IsString() requirements?: string;
  @IsOptional() @IsString() @MaxLength(20_000) note?: string;

  /** ARCHIVED closes the trial to new applications and hides it from the public list. */
  @ApiPropertyOptional({ enum: TrialStatus, enumName: 'TrialStatus' })
  @IsOptional()
  @IsEnum(TrialStatus)
  status?: TrialStatus;
}

/**
 * The academy withdrawing its own interest — the only status a manager may write
 * by hand.
 *
 * It used to accept SHORTLISTED, INVITED and ACCEPTED as well, which made every
 * gate in this flow optional: SHORTLISTED is what unlocks a private trial's
 * invitation, so a manager could invite a player no coach had screened, and
 * ACCEPTED is squad placement, so they could sign one no coach had tested. Both
 * are decisions TRIAL.md reserves for a coach (Rules 6, 8, 16). Saying "no
 * thanks" is not — an academy may always decline.
 */
const APPLICATION_STATUSES = ['REJECTED'] as const;

export class UpdateTrialApplicationStatusDto {
  @IsIn(APPLICATION_STATUSES) status: (typeof APPLICATION_STATUSES)[number];
}

const ATTRIBUTE = { min: 0, max: 100 } as const;

/**
 * The coach's verdict after physically testing the player — TRIAL.md Rules 4, 7.
 *
 * PASS/FAIL, never ACCEPT/REJECT: this is the football examination, not the
 * online screening that decides who is worth looking at (§36).
 *
 * Ratings are required on a PASS and optional on a FAIL, mirroring the online
 * review: numbers taken on a pitch are the most credible the platform can hold,
 * but making a coach fill in eight fields to fail somebody is how "fail" stops
 * being used honestly.
 */
export class RecordTrialVerdictDto {
  @IsIn(['PASS', 'FAIL']) verdict: 'PASS' | 'FAIL';

  @IsOptional() @IsString() @MaxLength(1000) note?: string;

  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) speed?: number;
  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) passing?: number;
  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) vision?: number;
  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) dribbling?: number;
  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) finishing?: number;
  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) physical?: number;
  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) leadership?: number;
  @IsOptional() @IsInt() @Min(ATTRIBUTE.min) @Max(ATTRIBUTE.max) discipline?: number;
}

/** Paging for the academy's archived-trial history. */
export class TrialHistoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number = 10;
}

/** Who works this trial. Replaces the whole list, so it is also how one is removed. */
export class AssignCoachesDto {
  @IsArray() @IsUUID('4', { each: true }) coachUserIds: string[];
}

/** The invitation the player reads, so the note is not optional. */
export class InviteToTrialDto {
  @IsString() @MinLength(1) @MaxLength(500) note: string;
}

export class RespondToInvitationDto {
  @IsBoolean() accept: boolean;
}
