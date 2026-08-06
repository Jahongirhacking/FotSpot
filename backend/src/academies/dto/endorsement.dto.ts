import { ApiPropertyOptional } from '@nestjs/swagger';
import { EndorsementRole } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListEndorsementsDto {
  @ApiPropertyOptional({ enum: EndorsementRole, enumName: 'EndorsementRole' })
  @IsOptional()
  @IsEnum(EndorsementRole)
  role?: EndorsementRole;
}
