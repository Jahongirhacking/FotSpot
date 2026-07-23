import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

const REPORT_TYPES = ['USER', 'MEDIA', 'ACADEMY', 'COACH'] as const;

export class CreateReportDto {
  @IsIn(REPORT_TYPES) type: (typeof REPORT_TYPES)[number];
  @IsString() reason: string;

  @IsOptional() @IsUUID() targetUserId?: string;
  @IsOptional() @IsUUID() targetMediaId?: string;
  @IsOptional() @IsUUID() targetAcademyId?: string;
  @IsOptional() @IsUUID() targetCoachId?: string;
}

export class ResolveReportDto {
  @IsIn(['RESOLVED', 'DISMISSED'])
  status: 'RESOLVED' | 'DISMISSED';

  @IsOptional() @IsString() resolutionNote?: string;

  /** If resolving a MEDIA report and the content should come down. */
  @IsOptional()
  removeMedia?: boolean;
}
