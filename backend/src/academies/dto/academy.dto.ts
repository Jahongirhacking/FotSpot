import { AcademyMemberRole, AcademyMemberStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Identity for a manager account the platform creates on the academy's behalf.
 *
 * No password field: it is generated server-side and returned once. An admin
 * choosing the password for someone else's account is how "Parol123" ends up
 * guarding a database of children.
 */
export class NewManagerDto {
  @IsString() @MinLength(1) @MaxLength(60) firstName: string;
  @IsString() @MinLength(1) @MaxLength(60) lastName: string;

  /** Optional, and only for reaching them later — sign-in is by username. */
  @IsOptional() @IsPhoneNumber() phone?: string;
}

/**
 * Admin-only (see AcademiesController). Uzbekistan has roughly 50 academies, so
 * they are onboarded by the platform team rather than self-registered.
 *
 * An academy has exactly one manager, and the two ways to name them are mutually
 * exclusive: attach an existing account (`managerUserId`) or have the platform mint
 * one (`newManager`). Both may be omitted — an admin can enter the academy before
 * knowing who runs it and assign the manager later.
 */
export class CreateAcademyDto {
  @IsString() name: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsUUID() managerUserId?: string;

  @IsOptional() @ValidateNested() @Type(() => NewManagerDto) newManager?: NewManagerDto;
}

/** Assigns or replaces the single manager of an existing academy. Admin-only. */
export class SetManagerDto {
  @IsOptional() @IsUUID() managerUserId?: string;

  @IsOptional() @ValidateNested() @Type(() => NewManagerDto) newManager?: NewManagerDto;
}

export class UpdateAcademyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() description?: string;
}

export class AddStaffMemberDto {
  @IsUUID() userId: string;
  /** Players are members too — an academy's squad is a roster, not a search. */
  @IsIn(['COACH', 'SCOUT', 'PLAYER']) role: 'COACH' | 'SCOUT' | 'PLAYER';
}

/**
 * Change what a member is, or whether they are still active.
 *
 * There is no delete. A coach who has left keeps every assessment they made, and
 * a row that vanishes takes the meaning of those judgements with it.
 */
export class UpdateMemberDto {
  @IsOptional() @IsIn(['COACH', 'SCOUT', 'PLAYER']) role?: 'COACH' | 'SCOUT' | 'PLAYER';
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}

export class ListMembersDto {
  @IsOptional() @IsIn(['MANAGER', 'COACH', 'SCOUT', 'PLAYER']) role?: AcademyMemberRole;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'RELEASED']) status?: AcademyMemberStatus;
}

/** Take on a member another academy has released. */
export class ImportMemberDto {
  @IsUUID() memberId: string;
}
