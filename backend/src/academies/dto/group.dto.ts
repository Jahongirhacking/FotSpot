import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
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

export class CreateGroupDto {
  @IsString() @MinLength(1) @MaxLength(60) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  /** R2 object key from an upload, never a URL — see storage.keys.ts. */
  @IsOptional() @IsString() @MaxLength(500) imageKey?: string;
}

export class UpdateGroupDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(500) imageKey?: string;
}

/**
 * Move people into a group, or back to the reserve.
 *
 * `groupId` omitted means the reserve — the absence of a group, which is where a
 * member starts and where a transfer lands them.
 *
 * A list because a manager sorting a new intake moves eight players at once, and
 * eight round trips is how a screen ends up half-applied.
 */
export class MoveMembersDto {
  @IsArray() @IsUUID('4', { each: true }) memberIds: string[];
  @IsOptional() @IsUUID() groupId?: string;
}

/** Offer a member to another academy. Nothing moves until they answer. */
export class RequestTransferDto {
  @IsUUID() memberId: string;
  @IsUUID() toAcademyId: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/**
 * Paging the account picker.
 *
 * `query` matches first name, last name or handle — the three things a manager
 * actually knows about somebody they are trying to add.
 */
export class ListCandidatesDto {
  /**
   * Declared here rather than read separately: the global ValidationPipe runs
   * `forbidNonWhitelisted` over the whole query object, so a parameter missing
   * from this DTO is a 400 even when the handler binds it by name.
   */
  @ApiPropertyOptional({ enum: ['PLAYER', 'COACH', 'SCOUT'] })
  @IsOptional()
  @IsIn(['PLAYER', 'COACH', 'SCOUT'])
  role?: 'PLAYER' | 'COACH' | 'SCOUT';

  @IsOptional() @IsString() @MaxLength(80) query?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
}
