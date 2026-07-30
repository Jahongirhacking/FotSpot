import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AcademiesService } from './academies.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AddStaffMemberDto, CreateAcademyDto, UpdateAcademyDto } from './dto/academy.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('academies')
@ApiBearerAuth('bearer')
@Controller('academies')
export class AcademiesController {
  constructor(private academiesService: AcademiesService) {}

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
}
