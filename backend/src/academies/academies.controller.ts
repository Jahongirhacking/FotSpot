import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AcademiesService } from './academies.service';
import { EndorsementsService } from './endorsements.service';
import { EndorseDto, ListEndorsementsDto } from './dto/endorsement.dto';
import { EndorsementRole } from '@prisma/client';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AddStaffMemberDto, CreateAcademyDto, UpdateAcademyDto } from './dto/academy.dto';
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

  @Public()
  @Get(':id')
  getPublicProfile(@Param('id') id: string) {
    return this.academiesService.getPublicProfile(id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAcademyDto) {
    return this.academiesService.update(user.userId, id, dto);
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
