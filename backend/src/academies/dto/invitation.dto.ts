import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Asking somebody to join the academy.
 *
 * MANAGER is not offerable: an academy has exactly one, and who it is is decided
 * where academies are administered, not by the manager inviting a replacement.
 */
export class InviteMemberDto {
  @IsUUID() userId: string;

  @ApiProperty({ enum: ['COACH', 'SCOUT', 'PLAYER'] })
  @IsIn(['COACH', 'SCOUT', 'PLAYER'])
  role: 'COACH' | 'SCOUT' | 'PLAYER';

  /** Shown to the person deciding — "we watched you at the Andijon trial". */
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
