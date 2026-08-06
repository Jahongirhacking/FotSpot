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
  @IsDateString() date: string;
  @IsOptional() @IsString() requirements?: string;
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
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() requirements?: string;

  /** ARCHIVED closes the trial to new applications and hides it from the public list. */
  @ApiPropertyOptional({ enum: TrialStatus, enumName: 'TrialStatus' })
  @IsOptional()
  @IsEnum(TrialStatus)
  status?: TrialStatus;
}

const APPLICATION_STATUSES = ['SHORTLISTED', 'INVITED', 'REJECTED', 'ACCEPTED'] as const;

export class UpdateTrialApplicationStatusDto {
  @IsIn(APPLICATION_STATUSES) status: (typeof APPLICATION_STATUSES)[number];
}

/** Who works this trial. Replaces the whole list, so it is also how one is removed. */
export class AssignCoachesDto {
  @IsArray() @IsUUID('4', { each: true }) coachUserIds: string[];
}

/** The academy putting a player forward for a private trial. */
export class NominatePlayerDto {
  @IsUUID() playerId: string;

  /** Whose eye the manager wants on them. Required — this is Process A(manual). */
  @IsUUID() coachUserId: string;
}

/** The invitation the player reads, so the note is not optional. */
export class InviteToTrialDto {
  @IsString() @MinLength(1) @MaxLength(500) note: string;
}

export class RespondToInvitationDto {
  @IsBoolean() accept: boolean;
}
