import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
  IsUUID,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * Admin user lookup.
 *
 * `query` is length-capped: it reaches four `contains` filters, and an
 * unbounded search term is an unbounded pattern for Postgres to scan on a table
 * that grows with every signup.
 */
export class SearchUsersDto extends PaginationDto {
  @IsOptional() @IsString() @MaxLength(120) query?: string;
}

export class VerifyDto {
  @IsBoolean() approve: boolean;
}

/**
 * Mints a new admin account — **super admin only**.
 *
 * ## Why there is no `userId` here any more
 *
 * This used to promote an account picked out of a search box. That is the wrong
 * shape for how admins actually come to exist: they are staff the platform team
 * hires, not users who happen to already be on the platform, and promoting a
 * live account silently gives an existing scout or coach the run of every
 * moderation queue while they keep their old identity. Searching for a person who
 * is not there yet also has no answer.
 *
 * So an admin is *created*, the same way an academy manager is (§1.10): the super
 * admin types a name, the platform mints the credentials, and they are shown once
 * to be handed over. Granting `admin` to a pre-existing account is still possible
 * where it genuinely belongs — deliberately, one account at a time, from that
 * user's own detail page (`PATCH /admin/users/:id/roles`).
 */
export class CreateAdminDto {
  @IsString() @MinLength(1) @MaxLength(60) firstName: string;
  @IsString() @MinLength(1) @MaxLength(60) lastName: string;

  /** Optional, and only for reaching them later — sign-in is by username. */
  @IsOptional() @IsPhoneNumber() phone?: string;
}

export class CreatePermissionDto {
  @IsString() key: string;
}

export class GrantRolePermissionDto {
  @IsUUID() roleId: string;
  @IsUUID() permissionId: string;
}

/** Super-admin only: enable or disable an account (reversible, unlike deletion). */
export class SetUserActiveDto {
  @IsBoolean() isActive: boolean;
}

/** Super-admin only: grant or remove any role. */
export class SetUserRoleDto {
  @IsIn(['scout', 'player', 'coach', 'academy_manager', 'admin'])
  role: string;

  @IsBoolean() grant: boolean;
}
