import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AcademyScoutFollowState, FollowTargetType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateFollowDto {
  @ApiProperty({ enum: FollowTargetType, enumName: 'FollowTargetType' })
  @ApiProperty({ enum: FollowTargetType, enumName: 'FollowTargetType' })
  @IsEnum(FollowTargetType)
  targetType: FollowTargetType;

  @IsString()
  targetId: string;
}

export class ListFollowsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: FollowTargetType, enumName: 'FollowTargetType' })
  @IsOptional()
  @ApiPropertyOptional({ enum: FollowTargetType, enumName: 'FollowTargetType' })
  @IsEnum(FollowTargetType)
  targetType?: FollowTargetType;
}

/** Academy -> scout trust (README 1.5.2). */
export class SetScoutFollowStateDto {
  @IsString()
  scoutId: string;

  @ApiProperty({ enum: AcademyScoutFollowState, enumName: 'AcademyScoutFollowState' })
  @ApiProperty({ enum: AcademyScoutFollowState, enumName: 'AcademyScoutFollowState' })
  @IsEnum(AcademyScoutFollowState)
  state: AcademyScoutFollowState;
}
