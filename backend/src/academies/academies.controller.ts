import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AcademiesService } from './academies.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AddStaffMemberDto, CreateAcademyDto, UpdateAcademyDto } from './dto/academy.dto';

@Controller('academies')
export class AcademiesController {
  constructor(private academiesService: AcademiesService) {}

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
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAcademyDto,
  ) {
    return this.academiesService.update(user.userId, id, dto);
  }

  @Post(':id/staff')
  addStaff(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddStaffMemberDto,
  ) {
    return this.academiesService.addStaff(user.userId, id, dto);
  }

  @Get(':id/staff')
  listStaff(@Param('id') id: string) {
    return this.academiesService.listStaff(id);
  }
}
