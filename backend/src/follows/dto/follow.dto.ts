import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AcademyScoutFollowState, FollowTargetType } from '@prisma/client';

export class CreateFollowDto {
  @IsEnum(FollowTargetType)
  targetType: FollowTargetType;

  @IsString()
  targetId: string;
}

export class ListFollowsDto {
  @IsOptional()
  @IsEnum(FollowTargetType)
  targetType?: FollowTargetType;

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

/** Academy -> scout trust (README 1.5.2). */
export class SetScoutFollowStateDto {
  @IsString()
  scoutId: string;

  @IsEnum(AcademyScoutFollowState)
  state: AcademyScoutFollowState;
}
