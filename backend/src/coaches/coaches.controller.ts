import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CoachesService } from './coaches.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateAssessmentDto, CreateCoachProfileDto } from './dto/coach.dto';
import { CreateCoachForAcademyDto } from './dto/coach.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('coaches')
@ApiBearerAuth('bearer')
@Controller('coaches')
export class CoachesController {
  constructor(private coachesService: CoachesService) {}

  @Post('me')
  createProfile(@CurrentUser() user: AuthUser, @Body() dto: CreateCoachProfileDto) {
    return this.coachesService.createProfile(user.userId, dto);
  }

  @Get('me')
  getOwnProfile(@CurrentUser() user: AuthUser) {
    return this.coachesService.getOwnProfile(user.userId);
  }

  @Public()
  @Get(':id')
  getPublicProfile(@Param('id') id: string) {
    return this.coachesService.getPublicProfile(id);
  }

  /**
   * An academy manager adds a coach to their academy. Created VERIFIED — the
   * academy vouches for them, and the platform already vetted the academy.
   */
  @Post('academy/:academyId')
  createForAcademy(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
    @Body() dto: CreateCoachForAcademyDto,
  ) {
    return this.coachesService.createForAcademy(user.userId, academyId, dto);
  }

  @Post('assessments')
  createAssessment(@CurrentUser() user: AuthUser, @Body() dto: CreateAssessmentDto) {
    return this.coachesService.createAssessment(user.userId, dto);
  }

  @Public()
  @Get('assessments/player/:playerId')
  listForPlayer(@Param('playerId') playerId: string, @Query() dto: PaginationDto) {
    return this.coachesService.listAssessmentsForPlayer(playerId, dto);
  }
}
