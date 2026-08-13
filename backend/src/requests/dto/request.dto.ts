import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupportRequestStatus, SupportRequestType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateSupportRequestDto {
  @ApiProperty({ enum: SupportRequestType, enumName: 'SupportRequestType' })
  @IsEnum(SupportRequestType)
  type: SupportRequestType;

  /**
   * Optional on purpose. "Delete my account" needs no explanation, and demanding
   * one puts a hurdle in front of something the privacy policy states as a right.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

/** An admin picking a request up, or closing it. */
export class UpdateSupportRequestDto {
  @ApiProperty({ enum: SupportRequestStatus, enumName: 'SupportRequestStatus' })
  @IsEnum(SupportRequestStatus)
  status: SupportRequestStatus;

  /** What was done, for whoever reads this row in six months. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  handledNote?: string;
}

export class ListSupportRequestsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: SupportRequestStatus, enumName: 'SupportRequestStatus' })
  @IsOptional()
  @IsEnum(SupportRequestStatus)
  status?: SupportRequestStatus;

  @ApiPropertyOptional({ enum: SupportRequestType, enumName: 'SupportRequestType' })
  @IsOptional()
  @IsEnum(SupportRequestType)
  type?: SupportRequestType;
}
