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
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { TIME_PATTERN } from '../trial-window.util';

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

  /**
   * When the trial window opens. **Optional** — omit it for an open-ended trial.
   *
   * Optional and not merely nullable because an open-ended trial is created by
   * a form that never showed these fields, so it sends nothing rather than
   * sending nulls. `validateWindow` is what enforces the real rule: all four of
   * `date` / `endDate` / `startTime` / `endTime`, or none of them.
   */
  @IsOptional() @IsDateString() date?: string;

  /** When the window closes. Same date as `date` for a one-day trial. */
  @IsOptional() @IsDateString() endDate?: string;

  /**
   * The daily window, `HH:mm` wall clock — `"09:00"` to `"18:00"`.
   *
   * A pattern rather than a date type: this is a time of day at a place, not an
   * instant, and parsing it into one would need a day to attach it to. See the
   * schema comment on `Trial.startTime`.
   */
  @IsOptional() @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm' })
  startTime?: string;

  @IsOptional() @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm' })
  endTime?: string;

  /**
   * Who the trial is for. Defaults to `male`, matching the player card's own
   * `z.enum(['male', 'female'])` rather than introducing a second vocabulary.
   */
  @IsOptional() @IsIn(['male', 'female']) gender?: string;

  /**
   * R2 object key for the cover image, from `POST /academies/:id/images/upload-url`.
   *
   * A key, never a URL (storage.keys.ts). It is checked against the academy's
   * own prefix server-side, so a key naming another academy's directory is
   * refused rather than stored.
   */
  @IsOptional() @IsString() @MaxLength(512) coverKey?: string;

  /**
   * Last moment somebody may apply. Must not be after the window opens.
   *
   * **Optional since open-ended trials.** A closing date for a trial with no
   * dates is a deadline about nothing; a dated trial should still carry one, and
   * the form asks for it.
   */
  @IsOptional() @IsDateString() applyDeadline?: string;

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
  /**
   * `null` clears it — see `patchedDate`. Absent leaves it alone; those are
   * different requests, and un-ticking "dated trial" is the one that sends null.
   */
  @IsOptional() @IsDateString() date?: string | null;

  /** The other end of the window. See `CreateTrialDto`. */
  @IsOptional() @IsDateString() endDate?: string | null;

  @IsOptional() @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm' })
  startTime?: string | null;

  @IsOptional() @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm' })
  endTime?: string | null;

  @IsOptional() @IsIn(['male', 'female']) gender?: string;

  @IsOptional() @IsString() @MaxLength(512) coverKey?: string | null;

  @IsOptional() @IsDateString() applyDeadline?: string | null;
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

/**
 * The coach's verdict after physically testing the player — TRIAL.md Rules 4, 7.
 *
 * PASS/FAIL, never ACCEPT/REJECT: this is the football examination, not the
 * online screening that decides who is worth looking at (§36).
 *
 * There are no attribute ratings on this DTO, and there must not be (Rule 22).
 * One morning is enough to say PASS; it is not enough to fill in eight
 * attributes as though the coach had worked with the player for a season. Those
 * come later, from a coach who shares the player's squad group (Rule 21,
 * README §1.9) — a trialist shares one with nobody.
 */
export class RecordTrialVerdictDto {
  @IsIn(['PASS', 'FAIL']) verdict: 'PASS' | 'FAIL';

  @IsOptional() @IsString() @MaxLength(1000) note?: string;
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
