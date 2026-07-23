import { IsBoolean, IsString, IsUUID } from 'class-validator';

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
