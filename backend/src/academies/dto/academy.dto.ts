import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Admin-only (see AcademiesController). Uzbekistan has roughly 50 academies, so
 * they are onboarded by the platform team rather than self-registered.
 */
export class CreateAcademyDto {
  @IsString() name: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() description?: string;

  /**
   * The user who will manage this academy. Optional so an admin can create the
   * record before knowing who runs it; the manager can be attached later.
   */
  @IsOptional() @IsUUID() managerUserId?: string;
}

export class UpdateAcademyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() description?: string;
}

export class AddStaffMemberDto {
  @IsUUID() userId: string;
  @IsIn(['COACH', 'SCOUT']) role: 'COACH' | 'SCOUT';
}
