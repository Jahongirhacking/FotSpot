import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateReportDto, ResolveReportDto } from './dto/moderation.dto';
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
}
