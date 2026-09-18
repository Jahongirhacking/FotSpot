import { ApiPropertyOptional } from '@nestjs/swagger';
import { DominantFoot } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** A career passes through a few academies, not dozens. */
export const MAX_ACADEMIES_PER_PLAYER = 10;

/**
 * Create and patch share one shape, every field optional on the patch: the
 * same rule as `SavePostDto`. Names are required on create and checked in the
 * service, where the create/patch difference actually lives.
 */
export class SaveProfessionalPlayerDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) lastName?: string;

  /** Key from the upload ticket; re-checked against the player's own prefix. `''` clears. */
  @IsOptional() @IsString() @MaxLength(512) avatarKey?: string;

  /** Free-text position code, as on a player profile (GK, CB, …). `''` clears. */
  @IsOptional() @IsString() @MaxLength(20) position?: string;

  @ApiPropertyOptional({ enum: DominantFoot, enumName: 'DominantFoot', nullable: true })
  @IsOptional()
  @IsEnum(DominantFoot)
  dominantFoot?: DominantFoot | null;

  /** The academies this player came through — replaces the whole set when present. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ACADEMIES_PER_PLAYER)
  @IsUUID('4', { each: true })
  academyIds?: string[];
}

export class ListProfessionalPlayersDto extends PaginationDto {
  @IsOptional() @IsString() @MaxLength(80) query?: string;
  /** Only players who came through this academy. */
  @IsOptional() @IsUUID() academyId?: string;
}

export class ProfessionalPlayerImageUploadDto {
  @IsString() @MaxLength(200) filename: string;
  @IsOptional() @IsString() @MaxLength(100) contentType?: string;
}

/** The academy's side of the relation: the whole set, in one write. */
export class SetAcademyProfessionalPlayersDto {
  @IsArray() @ArrayMaxSize(100) @IsUUID('4', { each: true }) professionalPlayerIds: string[];
}
