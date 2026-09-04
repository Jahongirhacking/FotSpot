import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MediaStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

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

/** `ALL`, or one processing status — the filter on the admin's clip list. */
export const MEDIA_STATUS_FILTERS = ['ALL', ...Object.values(MediaStatus)] as const;
export type MediaStatusFilter = (typeof MEDIA_STATUS_FILTERS)[number];

/**
 * Which clips, by what the worker has said about them.
 *
 * This is the other axis from the review queue. The queue asks "what has no
 * moderator watched yet" and is filtered on `moderationStatus`; this asks "what
 * state is the upload itself in" — and it exists because PROCESSING and FAILED
 * clips, which no moderation state describes, were on no screen at all.
 */
export class ListMediaDto extends PaginationDto {
  @ApiPropertyOptional({ enum: MEDIA_STATUS_FILTERS, default: 'ALL' })
  @IsOptional()
  @IsIn(MEDIA_STATUS_FILTERS)
  status?: MediaStatusFilter;
}
