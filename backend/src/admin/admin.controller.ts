import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AssignAdminDto,
  CreatePermissionDto,
  GrantRolePermissionDto,
  VerifyDto,
} from './dto/admin.dto';

@Controller('admin')
@Roles('admin', 'super_admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Patch('coaches/:id/verify')
  verifyCoach(@Param('id') id: string, @Body() dto: VerifyDto) {
    return this.adminService.verifyCoach(id, dto.approve);
  }

  @Patch('academies/:id/verify')
  verifyAcademy(@Param('id') id: string, @Body() dto: VerifyDto) {
    return this.adminService.verifyAcademy(id, dto.approve);
  }

  @Get('audit-logs')
  listAuditLogs() {
    return this.adminService.listAuditLogs();
  }

  // ---- Super Admin only (1.2 restriction: plain Admins cannot create admins) ----

  @Roles('super_admin')
  @Post('admins')
  assignAdmin(@Body() dto: AssignAdminDto) {
    return this.adminService.assignAdmin(dto.userId);
  }

  @Roles('super_admin')
  @Patch('admins/:userId/revoke')
  revokeAdmin(@Param('userId') userId: string) {
    return this.adminService.revokeAdmin(userId);
  }

  @Roles('super_admin')
  @Get('roles')
  listRoles() {
    return this.adminService.listRoles();
  }

  @Roles('super_admin')
  @Post('permissions')
  createPermission(@Body() dto: CreatePermissionDto) {
    return this.adminService.createPermission(dto.key);
  }

  @Roles('super_admin')
  @Post('roles/permissions')
  grantRolePermission(@Body() dto: GrantRolePermissionDto) {
    return this.adminService.grantRolePermission(dto.roleId, dto.permissionId);
  }
}
