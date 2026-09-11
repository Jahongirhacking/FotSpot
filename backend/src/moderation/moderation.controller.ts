import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreateReportDto,
  ListAppealsDto,
  ListMediaDto,
  ModerateCategoryDto,
  ModerateRatingDto,
  ResolveAppealDto,
  ResolveReportDto,
} from './dto/moderation.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('moderation')
@ApiBearerAuth('bearer')
@Controller('moderation')
export class ModerationController {
  constructor(private moderationService: ModerationService) {}

  @Post('reports')
  fileReport(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.moderationService.fileReport(user.userId, dto);
  }

  @Roles('admin', 'super_admin')
  @Get('reports/pending')
  listPending(@Query() dto: PaginationDto) {
    return this.moderationService.listPending(dto);
  }

  @Roles('admin', 'super_admin')
  @Patch('reports/:id/resolve')
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResolveReportDto) {
    return this.moderationService.resolve(user.userId, id, dto);
  }

  @Roles('admin', 'super_admin')
  @Patch('media/:id/flag')
  flagMedia(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.moderationService.flagMedia(user.userId, id);
  }

  // ---- Video review (§1.7). Every clip lands here before anyone can watch it.

  /**
   * The clips waiting for review, newest first, each with the player who
   * uploaded it. Admin and super admin alike — reviewing is the ordinary job.
   */
  @Roles('admin', 'super_admin')
  @Get('media/pending')
  listUnverifiedMedia(@Query() dto: PaginationDto) {
    return this.moderationService.listUnverifiedMedia(dto);
  }

  /**
   * Every video by processing status — the list a stuck upload was missing from.
   *
   * The review queue above is filtered on what a moderator has decided; this is
   * filtered on what the worker has established (`?status=PROCESSING`, `FAILED`,
   * … or `ALL`). PROCESSING rows carry what the queue says about their job, so
   * an admin can tell "still running" from "nothing is going to finish this".
   */
  @Roles('admin', 'super_admin')
  @Get('media')
  listMedia(@Query() dto: ListMediaDto) {
    return this.moderationService.listMediaByStatus(dto);
  }

  /** How many videos are in each processing status, for the filter chips. */
  @Roles('admin', 'super_admin')
  @Get('media/counts')
  countMedia() {
    return this.moderationService.countMediaByStatus();
  }

  /**
   * Clips an admin has blocked — **super admin only**.
   *
   * Gated to the super admin because the only action on this list is the one
   * only they may take: a plain admin blocking content does not also get a
   * standing inventory of everything the platform has taken down, and the
   * decisions themselves stay readable by any admin on the audit log.
   */
  @Roles('super_admin')
  @Get('media/blocked')
  listBlockedMedia(@Query() dto: PaginationDto) {
    return this.moderationService.listBlockedMedia(dto);
  }

  /**
   * Uploads the worker could not confirm — **super admin only**.
   *
   * The same gate as the blocked list, for the same reason: the one action on
   * it, retrying the platform's own processing, is an operator's decision.
   */
  @Roles('super_admin')
  @Get('media/failed')
  listFailedMedia(@Query() dto: PaginationDto) {
    return this.moderationService.listFailedMedia(dto);
  }

  /**
   * Process again. Not a status override — a FAILED clip, or a PROCESSING one
   * with no live job, is queued again through the same worker every upload
   * goes through, and becomes ACTIVE only when that worker says so. The
   * moderation status is untouched: a verified clip stays visible throughout.
   *
   * Both admin roles, like verify and block: it is part of working the queue,
   * not destruction.
   */
  @Roles('admin', 'super_admin')
  @Patch('media/:id/retry')
  retryFailedMedia(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.moderationService.retryFailedMedia(user.userId, id);
  }

  /**
   * Approve a clip: it becomes publicly visible and leaves this queue.
   *
   * No confirmation on the client either — verifying is the ordinary outcome and
   * the queue has to be workable at speed. It is also the reversible direction in
   * practice: a clip approved by mistake can still be reported, flagged and taken
   * down, whereas the destructive action below cannot be undone at all.
   */
  @Roles('admin', 'super_admin')
  @Patch('media/:id/verify')
  verifyMedia(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.moderationService.verifyMedia(user.userId, id);
  }

  /** Take a clip down for good, keeping the row for the moderation record. */
  @Roles('admin', 'super_admin')
  @Patch('media/:id/block')
  blockMedia(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.moderationService.blockMedia(user.userId, id);
  }

  /**
   * Erase a clip and its files — **super admin only**, and irreversible.
   *
   * The same rule as deleting an account (§1.2): a plain admin moderates, only a
   * super admin destroys. `@Roles` on the handler overrides nothing above it —
   * this controller has no class-level role gate, so each route states its own.
   */
  @Roles('super_admin')
  @Delete('media/:id')
  deleteMedia(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.moderationService.deleteMedia(user.userId, id);
  }

  /**
   * Takes a live, verified clip down. Super admin only: the queue's Block is a
   * first decision on something nobody has seen; this undoes a decision on
   * something people have.
   */
  @Roles('super_admin')
  @Patch('media/:id/block-active')
  blockActiveMedia(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.moderationService.blockActiveMedia(user.userId, id);
  }

  /** Puts a blocked clip back on the public surfaces. Super admin only. */
  @Roles('super_admin')
  @Patch('media/:id/unblock')
  unblockMedia(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.moderationService.unblockMedia(user.userId, id);
  }

  /** A flagged clip, cleared: back to ACTIVE. */
  @Roles('admin', 'super_admin')
  @Patch('media/:id/restore')
  restoreFlaggedMedia(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.moderationService.restoreFlaggedMedia(user.userId, id);
  }

  /** A flagged clip, taken down for good: REMOVED, row and trail kept. */
  @Roles('admin', 'super_admin')
  @Patch('media/:id/remove')
  removeFlaggedMedia(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.moderationService.removeFlaggedMedia(user.userId, id);
  }

  // ---- Rating in review, and appeals ----

  /** A moderator's rating on the clip under review; a clip cannot be verified without one. */
  @Roles('admin', 'super_admin')
  @Patch('media/:id/rating')
  rateMedia(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ModerateRatingDto,
  ) {
    return this.moderationService.rateMedia(user.userId, id, dto);
  }

  /** Re-files the clip under the attribute the footage shows. */
  @Roles('admin', 'super_admin')
  @Patch('media/:id/category')
  recategoriseMedia(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ModerateCategoryDto,
  ) {
    return this.moderationService.recategoriseMedia(user.userId, id, dto);
  }

  /** Players' appeals against ratings, pending first. Super admins alone answer them. */
  @Roles('super_admin')
  @Get('appeals')
  listAppeals(@Query() dto: ListAppealsDto) {
    return this.moderationService.listAppeals(dto);
  }

  /** Answers an appeal with a new rating or the same one, and tells the player. */
  @Roles('super_admin')
  @Patch('appeals/:id')
  resolveAppeal(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResolveAppealDto,
  ) {
    return this.moderationService.resolveAppeal(user.userId, id, dto);
  }
}
