import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AcademiesService } from './academies.service';
import { EndorsementsService } from './endorsements.service';
import { EndorseDto, ListEndorsementsDto } from './dto/endorsement.dto';
import { EndorsementRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AddStaffMemberDto,
  CreateAcademyDto,
  SetManagerDto,
  UpdateAcademyDto,
} from './dto/academy.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('academies')
@ApiBearerAuth('bearer')
@Controller('academies')
export class AcademiesController {
  constructor(
    private academiesService: AcademiesService,
    private endorsements: EndorsementsService,
  ) {}

  /**
   * Admin-only. There are roughly fifty academies in Uzbekistan, so they are
   * onboarded by the platform team rather than self-registered — see
   * AcademiesService.register for the reasoning.
   */
  @Roles('admin', 'super_admin')
  @Post()
  register(@CurrentUser() user: AuthUser, @Body() dto: CreateAcademyDto) {
    return this.academiesService.register(user.userId, dto);
  }

  @Public()
  @Get()
  listPublic(@Query('region') region?: string) {
    return this.academiesService.listPublic(region);
  }

  /**
   * The academy the caller manages, or null.
   *
   * Declared before `:id` — Nest matches routes in declaration order, so putting
   * this after would make `/academies/mine` resolve as an academy whose id is the
   * literal string "mine".
   */
  @Get('mine')
  findMine(@CurrentUser() user: AuthUser) {
    return this.academiesService.findMine(user.userId);
  }

  @Public()
  @Get(':id')
  getPublicProfile(@Param('id') id: string) {
    return this.academiesService.getPublicProfile(id);
  }

  /**
   * What the caller is to this academy — manager, staff, endorsed, or a player it
   * accepted at a trial. Drives the "My academy" badge.
   */
  @Get(':id/relation')
  relation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academiesService.relationTo(user.userId, id);
  }

  /**
   * Assigns or replaces the academy's single manager (admin only). Either names an
   * existing user or mints an account, returning its one-time credentials once.
   */
  @Roles('admin', 'super_admin')
  @Patch(':id/manager')
  setManager(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetManagerDto) {
    return this.academiesService.setManager(user.userId, id, dto);
  }

  /** Issues the manager a fresh one-time password (admin only). */
  @Roles('admin', 'super_admin')
  @Post(':id/manager/reset-password')
  resetManagerPassword(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academiesService.resetManagerPassword(user.userId, id);
  }

  /** Manager edits their own; an admin may correct any (§1.10). */
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAcademyDto) {
    const isAdmin = user.roles.includes('admin') || user.roles.includes('super_admin');
    return this.academiesService.update(user.userId, id, dto, isAdmin);
  }

  /**
   * Archives an academy (admin only). Sets status REJECTED rather than deleting —
   * a hard delete would cascade through trials, applications and recommendation
   * history. See AcademiesService.archive.
   */
  @Roles('admin', 'super_admin')
  @Delete(':id')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academiesService.archive(user.userId, id);
  }

  /** Every academy including pending/archived — admin console list. */
  @Roles('admin', 'super_admin')
  @Get('admin/all')
  listAll() {
    return this.academiesService.listAll();
  }

  @Post(':id/staff')
  addStaff(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddStaffMemberDto) {
    return this.academiesService.addStaff(user.userId, id, dto);
  }

  @Get(':id/staff')
  listStaff(@Param('id') id: string) {
    return this.academiesService.listStaff(id);
  }

  // ---- Endorsements (README 1.5.3) ----

  /**
   * Endorse (hire) a scout or coach. Unlike following, this has consequences: it
   * is what lets a scout address a recommendation to this academy.
   */
  @Post(':id/endorsements')
  endorse(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EndorseDto) {
    return this.endorsements.endorse(user.userId, id, dto);
  }

  /** Ends the relationship. The record is kept as REVOKED, not deleted. */
  @Delete(':id/endorsements/:userId/:role')
  revokeEndorsement(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Param('role') role: EndorsementRole,
  ) {
    return this.endorsements.revoke(user.userId, id, userId, role);
  }

  /** This academy's endorsed scouts and coaches. Manager only. */
  @Get(':id/endorsements')
  listEndorsements(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() dto: ListEndorsementsDto,
  ) {
    return this.endorsements.listForAcademy(user.userId, id, dto.role);
  }
}
