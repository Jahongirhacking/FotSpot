import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EndorsementRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Academy hires/accredits a scout or coach — README 1.5.3. */
export class EndorseDto {
  @IsUUID() userId: string;

  @ApiProperty({ enum: EndorsementRole, enumName: 'EndorsementRole' })
  @IsEnum(EndorsementRole)
  role: EndorsementRole;

  @ApiPropertyOptional({ description: 'Internal note, visible to the academy only.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListEndorsementsDto {
  @ApiPropertyOptional({ enum: EndorsementRole, enumName: 'EndorsementRole' })
  @IsOptional()
  @IsEnum(EndorsementRole)
  role?: EndorsementRole;
}
