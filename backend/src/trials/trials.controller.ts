import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TrialsService } from './trials.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import {
  CreateTrialDto,
  UpdateTrialApplicationStatusDto,
  UpdateTrialDto,
} from './dto/trial.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('trials')
@ApiBearerAuth('bearer')
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

  /**
   * Edit a published trial, or archive it.
   *
   * Manager of the hosting academy only. See TrialsService.update for why an
   * archive exists where a delete does not.
   */
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTrialDto) {
    return this.trialsService.update(user.userId, id, dto);
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
