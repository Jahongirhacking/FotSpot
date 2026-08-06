import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TrialsService } from './trials.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import {
  AssignCoachesDto,
  CreateTrialDto,
  InviteToTrialDto,
  NominatePlayerDto,
  RespondToInvitationDto,
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

  /**
   * One trial. A general one is public; a private one is a 404 to anyone but the
   * academy, its coaches on that trial, and the player it concerns.
   *
   * `@Public()` with an optional user rather than an authenticated route: the
   * open board has to be readable by somebody who has not signed up yet.
   */
  @Public()
  @Get(':id')
  getById(@CurrentUser() user: AuthUser | undefined, @Param('id') id: string) {
    return this.trialsService.getVisibleById(id, user?.userId);
  }

  /** Who works this trial — public, the way the hosting academy is. */
  @Public()
  @Get(':id/coaches')
  listCoaches(@Param('id') id: string) {
    return this.trialsService.listCoaches(id);
  }

  /** Name the coaches working this trial. Replaces the list. */
  @Post(':id/coaches')
  assignCoaches(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignCoachesDto,
  ) {
    return this.trialsService.assignCoaches(user.userId, id, dto.coachUserIds);
  }

  /**
   * Put a player forward for a private trial, starting Process A in `manual`.
   *
   * The mirror of a general trial's apply: there the player comes and screening
   * follows, here the academy chooses and screening comes first.
   */
  @Post(':id/nominate')
  nominate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: NominatePlayerDto) {
    return this.trialsService.nominate(user.userId, id, dto);
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

  /** Invite a screened player to a private trial, with the note they will read. */
  @Post('applications/:applicationId/invite')
  invite(
    @CurrentUser() user: AuthUser,
    @Param('applicationId') applicationId: string,
    @Body() dto: InviteToTrialDto,
  ) {
    return this.trialsService.invite(user.userId, applicationId, dto);
  }

  /** The player's yes or no — the one step nobody can take for them. */
  @Post('applications/:applicationId/respond')
  respond(
    @CurrentUser() user: AuthUser,
    @Param('applicationId') applicationId: string,
    @Body() dto: RespondToInvitationDto,
  ) {
    return this.trialsService.respondToInvitation(user.userId, applicationId, dto.accept);
  }

  /**
   * Take the player on: sends them an invitation to join the academy.
   *
   * Not a direct write to the squad — joining is still the player's yes to give,
   * the same rule every other route into a squad follows.
   */
  @Post('applications/:applicationId/squad')
  addToSquad(@CurrentUser() user: AuthUser, @Param('applicationId') applicationId: string) {
    return this.trialsService.addToSquad(user.userId, applicationId);
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
