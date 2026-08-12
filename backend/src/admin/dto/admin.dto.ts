import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, IsUUID } from 'class-validator';
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

export class AssignAdminDto {
  @IsUUID() userId: string;
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
