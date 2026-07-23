import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRecommendationDto {
  @IsUUID() playerId: string;
  @IsUUID() academyId: string;
  @IsOptional() @IsString() note?: string;
}

const STATUSES = ['REVIEWING', 'ACCEPTED', 'REJECTED'] as const;

export class UpdateRecommendationStatusDto {
  @IsIn(STATUSES) status: (typeof STATUSES)[number];
}
