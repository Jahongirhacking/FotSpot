import { IsBoolean, IsIn, IsString, IsUUID } from 'class-validator';

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
