import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

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

  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
}

export class UpdatePlayerProfileDto {
  @IsOptional() @IsNumber() height?: number;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsIn(['LEFT', 'RIGHT', 'BOTH']) dominantFoot?: 'LEFT' | 'RIGHT' | 'BOTH';
  @IsOptional() @IsString() primaryPosition?: string;
  @IsOptional() @IsString() secondaryPosition?: string;
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
