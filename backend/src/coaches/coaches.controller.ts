import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CoachesService } from './coaches.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateAssessmentDto, CreateCoachProfileDto } from './dto/coach.dto';

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

  @Post('assessments')
  createAssessment(@CurrentUser() user: AuthUser, @Body() dto: CreateAssessmentDto) {
    return this.coachesService.createAssessment(user.userId, dto);
  }

  @Public()
  @Get('assessments/player/:playerId')
  listForPlayer(@Param('playerId') playerId: string) {
    return this.coachesService.listAssessmentsForPlayer(playerId);
  }
}
