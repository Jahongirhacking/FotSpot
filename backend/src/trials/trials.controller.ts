import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TrialsService } from './trials.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { OptionalUser } from '../common/decorators/optional-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import {
  ListTrialsQueryDto,
  AssignCoachesDto,
  CoachQueueQueryDto,
  CreateTrialDto,
  RecordTrialVerdictDto,
  RespondToInvitationDto,
  TrialHistoryQueryDto,
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

  /**
   * How many trials have appeared since this account last opened the list.
   *
   * Declared before `:id`, since Nest matches in declaration order — otherwise
   * "unseen-count" is read as a trial id.
   */
  @Get('unseen-count')
  unseenCount(@CurrentUser() user: AuthUser) {
    return this.trialsService.unseenCount(user.userId);
  }

  /** Clears the badge. Sent when the trials list is opened. */
  @HttpCode(HttpStatus.OK)
  @Post('seen')
  markSeen(@CurrentUser() user: AuthUser) {
    return this.trialsService.markSeen(user.userId);
  }

  /**
   * The public board, filtered and ordered.
   *
   * `@OptionalUser` rather than `@CurrentUser`: the board is public, but
   * `sort=recommended` needs to know who is asking. A signed-out visitor simply
   * gets the newest-first order, which is what they would have got anyway.
   */
  @Public()
  @Get()
  listUpcoming(@Query() query: ListTrialsQueryDto, @OptionalUser() viewer?: AuthUser) {
    return this.trialsService.listUpcoming(query, viewer?.userId);
  }

  /**
   * The academy's finished trials, newest first.
   *
   * Manager-only and paginated: a history that never stops growing needs pages,
   * and an archived trial still carries its applicants.
   */
  @Get('academy/:academyId/history')
  listArchivedForAcademy(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
    @Query() query: TrialHistoryQueryDto,
  ) {
    return this.trialsService.listArchivedForAcademy(
      user.userId,
      academyId,
      query.page,
      query.pageSize,
    );
  }

  /**
   * The manager's private trials, open and archived, each with the one player
   * it was created for and where that player stands (`stage`). Manager only.
   */
  @Get('academy/:academyId/private')
  listPrivateForAcademy(@CurrentUser() user: AuthUser, @Param('academyId') academyId: string) {
    return this.trialsService.listPrivateForAcademy(user.userId, academyId);
  }

  /**
   * An academy's open trials. Public, but the private ones are staff-only —
   * a private trial names the child it was created for. See the service.
   */
  @Public()
  @Get('academy/:academyId')
  listForAcademy(@Param('academyId') academyId: string, @OptionalUser() viewer?: AuthUser) {
    return this.trialsService.listForAcademy(academyId, viewer?.userId);
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

  /**
   * The trials this coach is working.
   *
   * Assignment is the whole of a coach's relationship with a trial — it is what
   * lets them read a private one, see the sheet and record a verdict — so it is
   * also what this lists.
   */
  /**
   * The players this coach still owes a verdict — their work queue.
   *
   * Scoped to the caller by the `TrialCoach` assignment, so it cannot return
   * another coach's queue or another academy's workload whoever asks.
   */
  @Get('coaching/pending')
  listPendingForCoach(@CurrentUser() user: AuthUser, @Query() query: CoachQueueQueryDto) {
    return this.trialsService.listPendingForCoach(user.userId, query);
  }

  @Get('coaching/mine')
  listMyCoaching(@CurrentUser() user: AuthUser) {
    return this.trialsService.listForCoach(user.userId);
  }

  /**
   * Who is on the sheet, and what was decided. The manager sees every row; a
   * coach sees the participants — never an unanswered invitation, and never
   * the note the manager wrote to the family. `pending` counts the
   * invitations still awaiting an answer.
   */
  @Get(':id/applications')
  listApplicationsForTrial(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trialsService.listApplicationsForTrial(user.userId, id);
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
   * The coach's PASS or FAIL, after testing the player in person.
   *
   * Written by a coach working this trial, never by the manager — the academy
   * does not evaluate the football. Only a PASS makes the player eligible for a
   * squad place, and only a PASS clears their recommendations.
   */
  @Post('applications/:applicationId/verdict')
  recordVerdict(
    @CurrentUser() user: AuthUser,
    @Param('applicationId') applicationId: string,
    @Body() dto: RecordTrialVerdictDto,
  ) {
    return this.trialsService.recordVerdict(user.userId, applicationId, dto);
  }

  /**
   * Takes a verdict back, inside the undo window — the coach's own, before its
   * consequences have gone out. 409 once they have, or once the manager has
   * offered the passed player a squad place.
   */
  @Delete('applications/:applicationId/verdict')
  undoVerdict(@CurrentUser() user: AuthUser, @Param('applicationId') applicationId: string) {
    return this.trialsService.undoVerdict(user.userId, applicationId);
  }

  /**
   * Take the player on: sends them an invitation to join the academy.
   *
   * Not a direct write to the squad — joining is still the player's yes to give,
   * the same rule every other route into a squad follows. Requires a trial PASS.
   */
  @Post('applications/:applicationId/squad')
  addToSquad(@CurrentUser() user: AuthUser, @Param('applicationId') applicationId: string) {
    return this.trialsService.addToSquad(user.userId, applicationId);
  }

  /** The academy declining an applicant. The only status a manager may write. */
  @Patch('applications/:applicationId/status')
  updateApplicationStatus(
    @CurrentUser() user: AuthUser,
    @Param('applicationId') applicationId: string,
    @Body() dto: UpdateTrialApplicationStatusDto,
  ) {
    return this.trialsService.updateApplicationStatus(user.userId, applicationId, dto);
  }
}
