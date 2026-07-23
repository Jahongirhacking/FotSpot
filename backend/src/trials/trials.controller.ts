import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TrialsService } from './trials.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateTrialDto, UpdateTrialApplicationStatusDto } from './dto/trial.dto';

@Controller('trials')
export class TrialsController {
  constructor(private trialsService: TrialsService) {}

  @Post('academy/:academyId')
  create(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
    @Body() dto: CreateTrialDto,
  ) {
    return this.trialsService.create(user.userId, academyId, dto);
  }

  @Public()
  @Get()
  listUpcoming() {
    return this.trialsService.listUpcoming();
  }

  @Public()
  @Get('academy/:academyId')
  listForAcademy(@Param('academyId') academyId: string) {
    return this.trialsService.listForAcademy(academyId);
  }

  @Public()
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.trialsService.getById(id);
  }

  @Post(':id/apply')
  apply(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trialsService.apply(user.userId, id);
  }

  @Get('applications/mine')
  listMyApplications(@CurrentUser() user: AuthUser) {
    return this.trialsService.listMyApplications(user.userId);
  }

  @Get(':id/applications')
  listApplicationsForTrial(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trialsService.listApplicationsForTrial(user.userId, id);
  }

  @Patch('applications/:applicationId/status')
  updateApplicationStatus(
    @CurrentUser() user: AuthUser,
    @Param('applicationId') applicationId: string,
    @Body() dto: UpdateTrialApplicationStatusDto,
  ) {
    return this.trialsService.updateApplicationStatus(user.userId, applicationId, dto);
  }
}
