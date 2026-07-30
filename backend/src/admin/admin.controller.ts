import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import {
  AssignAdminDto,
  CreatePermissionDto,
  GrantRolePermissionDto,
  VerifyDto,
} from './dto/admin.dto';

@ApiTags('admin')
@ApiBearerAuth('bearer')
@Controller('admin')
@Roles('admin', 'super_admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Patch('coaches/:id/verify')
  verifyCoach(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VerifyDto) {
    return this.adminService.verifyCoach(user.userId, id, dto.approve);
  }

  @Patch('academies/:id/verify')
  verifyAcademy(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VerifyDto) {
    return this.adminService.verifyAcademy(user.userId, id, dto.approve);
  }

  @Get('audit-logs')
  listAuditLogs() {
    return this.adminService.listAuditLogs();
  }

  // ---- Super Admin only (1.2 restriction: plain Admins cannot create admins) ----

  @Roles('super_admin')
  @Post('admins')
  assignAdmin(@CurrentUser() user: AuthUser, @Body() dto: AssignAdminDto) {
    return this.adminService.assignAdmin(user.userId, dto.userId);
  }

  @Roles('super_admin')
  @Patch('admins/:userId/revoke')
  revokeAdmin(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.adminService.revokeAdmin(user.userId, userId);
  }

  @Roles('super_admin')
  @Get('roles')
  listRoles() {
    return this.adminService.listRoles();
  }

  @Roles('super_admin')
  @Post('permissions')
  createPermission(@CurrentUser() user: AuthUser, @Body() dto: CreatePermissionDto) {
    return this.adminService.createPermission(user.userId, dto.key);
  }

  @Roles('super_admin')
  @Post('roles/permissions')
  grantRolePermission(@CurrentUser() user: AuthUser, @Body() dto: GrantRolePermissionDto) {
    return this.adminService.grantRolePermission(user.userId, dto.roleId, dto.permissionId);
  }
}
