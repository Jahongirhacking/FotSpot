import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PlayingStyle } from '@prisma/client';

export class CreatePlayerProfileDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsDateString() birthDate: string;
  @IsString() gender: string;

  @IsOptional() @IsNumber() height?: number;
  @IsOptional() @IsNumber() weight?: number;

  @IsOptional() @IsIn(['LEFT', 'RIGHT', 'BOTH']) dominantFoot?: 'LEFT' | 'RIGHT' | 'BOTH';
  @IsOptional() @IsString() primaryPosition?: string;
  @IsOptional() @IsString() secondaryPosition?: string;
  @ApiPropertyOptional({ enum: PlayingStyle, enumName: 'PlayingStyle' })
  @IsOptional()
  @IsEnum(PlayingStyle)
  playingStyle?: PlayingStyle;

  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
}

export class UpdatePlayerProfileDto {
  /**
   * Editable, at the product's request.
   *
   * It is the one field here that is also an age gate (§11.1): the age band on the
   * card, the trial age checks and what counts as an under-18 account all read it,
   * so a player who edits it changes which trials they can apply to. It is
   * therefore bounded to a plausible playing age rather than accepted as any date,
   * and every change is written to the audit log.
   */
  @IsOptional() @IsDateString() birthDate?: string;

  @IsOptional() @IsNumber() height?: number;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsIn(['LEFT', 'RIGHT', 'BOTH']) dominantFoot?: 'LEFT' | 'RIGHT' | 'BOTH';
  @IsOptional() @IsString() primaryPosition?: string;
  @IsOptional() @IsString() secondaryPosition?: string;
  @ApiPropertyOptional({ enum: PlayingStyle, enumName: 'PlayingStyle' })
  @IsOptional()
  @IsEnum(PlayingStyle)
  playingStyle?: PlayingStyle;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
}

export class UpdatePlayerStatsDto {
  @IsOptional() @IsInt() @Min(0) matches?: number;
  @IsOptional() @IsInt() @Min(0) goals?: number;
  @IsOptional() @IsInt() @Min(0) assists?: number;
  @IsOptional() @IsInt() @Min(0) cleanSheets?: number;
  @IsOptional() @IsNumber() sprintTime?: number;
  @IsOptional() @IsInt() @Min(0) jugglingRecord?: number;
}

export class SearchPlayersDto {
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() position?: string;
  /** "We need a Destroyer, U16, Fergana" - README 21.3 recruitment filter. */
  @ApiPropertyOptional({ enum: PlayingStyle, enumName: 'PlayingStyle' })
  @IsOptional()
  @IsEnum(PlayingStyle)
  playingStyle?: PlayingStyle;
  @IsOptional() @IsString() query?: string;

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
