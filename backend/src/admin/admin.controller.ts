import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import {
  AssignAdminDto,
  CreatePermissionDto,
  GrantRolePermissionDto,
  VerifyDto,
  SetUserActiveDto,
  SetUserRoleDto,
  SearchUsersDto,
} from './dto/admin.dto';
import { SetUserPlanDto } from '../tariffs/dto/tariff.dto';

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

  @Roles('super_admin')
  @Get('admins')
  listAdmins() {
    return this.adminService.listAdmins();
  }

  /**
   * Find a user to promote or endorse, instead of pasting a UUID.
   *
   * A DTO rather than three raw `@Query` strings coerced with `Number()`: that
   * version accepted `?pageSize=999999` and answered with every account on the
   * platform, since nothing on the path validated it.
   */
  @Get('users')
  searchUsers(@Query() dto: SearchUsersDto) {
    return this.adminService.searchUsers(dto);
  }

  /** Read-only, any admin. Mutations below are super-admin only. */
  @Get('users/:id')
  userDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Roles('super_admin')
  @Patch('users/:id/status')
  setUserActive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetUserActiveDto,
  ) {
    return this.adminService.setUserActive(user.userId, id, dto.isActive);
  }

  @Roles('super_admin')
  @Patch('users/:id/roles')
  setUserRole(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetUserRoleDto) {
    return this.adminService.setUserRole(user.userId, id, dto.role, dto.grant);
  }

  /**
   * Move an account onto another tariff — **super admin only**.
   *
   * The only way a plan ever changes: there is no self-serve upgrade, so a user
   * cannot raise their own ceiling and a plain admin cannot raise somebody
   * else's. The limits each tier carries are edited on `/tariff-plans`.
   */
  @Roles('super_admin')
  @Patch('users/:id/plan')
  setUserPlan(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetUserPlanDto) {
    return this.adminService.setUserPlan(user.userId, id, dto.tier);
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
