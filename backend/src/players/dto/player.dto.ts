import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { IsRegionDistrictPair } from '../../common/validators/region-district.validator';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
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

  @IsOptional() @IsString() @IsRegionDistrictPair() region?: string;
  @IsOptional() @IsString() @IsRegionDistrictPair() district?: string;
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
  @IsOptional() @IsString() @IsRegionDistrictPair() region?: string;
  @IsOptional() @IsString() @IsRegionDistrictPair() district?: string;
}

export class UpdatePlayerStatsDto {
  @IsOptional() @IsInt() @Min(0) matches?: number;
  @IsOptional() @IsInt() @Min(0) goals?: number;
  @IsOptional() @IsInt() @Min(0) assists?: number;
  @IsOptional() @IsInt() @Min(0) cleanSheets?: number;
  @IsOptional() @IsNumber() sprintTime?: number;
  @IsOptional() @IsInt() @Min(0) jugglingRecord?: number;
}

/**
 * The orderings search offers.
 *
 * `name` and `age` are the two a person asks for out loud; `recommendations` is
 * how many scouts have put this player forward — named for what it counts rather
 * than for §1.5's earned weight, which is the better number and cannot be ordered
 * by without a NULL that reverses the result. See `searchOrderBy` for that story.
 *
 * Deliberately not here: the card's star rating and football-order position.
 * Neither is a column — stars are computed per page from clips and assessments
 * (`computeCardStars`), and position is a free-text string with no rank — so
 * ordering by either would mean ranking in memory after paging, which is not a
 * sort, it is a shuffle. Both need a schema change to do honestly.
 */
export const PLAYER_SORTS = ['name', 'age', 'recommendations'] as const;
export type PlayerSort = (typeof PLAYER_SORTS)[number];

export class SearchPlayersDto extends PaginationDto {
  @IsOptional() @IsString() region?: string;
  /** Only meaningful with a region — a district alone cannot be resolved. */
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() position?: string;
  /** "We need a Destroyer, U16, Fergana" - README 21.3 recruitment filter. */
  @ApiPropertyOptional({ enum: PlayingStyle, enumName: 'PlayingStyle' })
  @IsOptional()
  @IsEnum(PlayingStyle)
  playingStyle?: PlayingStyle;
  @IsOptional() @IsString() query?: string;

  /**
   * Age in years, inclusive at both ends.
   *
   * Asked as an age and stored as a birth date, so the comparison is done here
   * rather than by the caller: "under 16" must keep meaning under 16 next
   * birthday, and a client that converted to a date once would go stale.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) minAge?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) maxAge?: number;

  /** Which foot they play on — the recruitment question a position cannot answer. */
  @ApiPropertyOptional({ enum: ['LEFT', 'RIGHT', 'BOTH'] })
  @IsOptional()
  @IsIn(['LEFT', 'RIGHT', 'BOTH'])
  dominantFoot?: 'LEFT' | 'RIGHT' | 'BOTH';

  /**
   * What to order the results by. Omitted means newest profile first, which is
   * what this endpoint has always done and what an unsorted search still gets.
   *
   * Every value here maps to a column the database can order by, so page 2 is a
   * coherent question. A sort computed after the page was fetched would reshuffle
   * between pages and show the same player twice or never — see
   * `MediaService.feed` for the same reasoning stated at length.
   */
  @ApiPropertyOptional({ enum: PLAYER_SORTS })
  @IsOptional()
  @IsIn(PLAYER_SORTS)
  sort?: PlayerSort;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
