import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
import { MediaService } from './media.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ClientInfoParam, type ClientInfo } from '../common/decorators/client-info.decorator';
import { OptionalUser } from '../common/decorators/optional-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Throttle } from '../common/decorators/throttle.decorator';
import {
  ConfirmUploadDto,
  FeedDto,
  RateMediaDto,
  CreateMediaCommentDto,
  ListMediaCommentsDto,
  ListPlayerMediaDto,
  RequestUploadDto,
  UpdateMediaDto,
} from './dto/media.dto';

@ApiTags('media')
@ApiBearerAuth('bearer')
@Controller('media')
export class MediaController {
  constructor(private mediaService: MediaService) {}

  /**
   * Whether uploads can be accepted and how many clips the caller has left in
   * their plan's window, so the UI can say so before recording.
   */
  @Get('storage-status')
  storageStatus(@CurrentUser() user: AuthUser) {
    return this.mediaService.storageStatus(user.userId);
  }

  @Post('upload-url')
  requestUpload(@CurrentUser() user: AuthUser, @Body() dto: RequestUploadDto) {
    return this.mediaService.requestUpload(user.userId, dto);
  }

  @Post('confirm')
  confirmUpload(@CurrentUser() user: AuthUser, @Body() dto: ConfirmUploadDto) {
    return this.mediaService.confirmUpload(user.userId, dto);
  }

  /**
   * The newest clips platform-wide, each with its player. Drives the landing
   * strip in one request instead of one per player — see MediaService.listRecent.
   *
   * Declared before `player/:playerId` and `:id`, since Nest matches in
   * declaration order.
   */
  @Public()
  @Get('recent')
  listRecent(@Query('limit') limit?: string) {
    return this.mediaService.listRecent(limit ? Number(limit) : undefined);
  }

  /**
   * The ranked feed — the scout's and the academy manager's home screen.
   *
   * Signed in only: the ranking is personalised by who the caller follows and
   * marks what they have already liked, neither of which exists for a guest.
   * Declared before `player/:playerId` and `:id`, since Nest matches in
   * declaration order.
   */
  // The ranking joins four tables and aggregates two of them in full. Thirty a
  // minute is far more paging than a person does and a fraction of what it takes
  // to make the database the bottleneck.
  @Throttle({ limit: 30, windowSeconds: 60 })
  @Get('feed')
  feed(@CurrentUser() user: AuthUser, @Query() dto: FeedDto) {
    return this.mediaService.feed(user.userId, dto);
  }

  /** Players worth following, for the panel beside the feed. */
  @Get('feed/suggested-players')
  suggestedPlayers(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.mediaService.suggestedPlayers(user.userId, limit ? Number(limit) : undefined);
  }

  /**
   * A player's clips, newest first. `category` filters to one attribute's history.
   *
   * Public, but what it returns depends on who is asking: a visitor gets the
   * verified clips, the owner gets their own at every moderation stage so they
   * can see what is still waiting for review — see MediaService.listForPlayer.
   */
  @Public()
  @Get('player/:playerId')
  listForPlayer(
    @Param('playerId') playerId: string,
    @Query() dto: ListPlayerMediaDto,
    @OptionalUser() viewerUserId?: string,
  ) {
    return this.mediaService.listForPlayer(playerId, dto, viewerUserId);
  }

  /** The uploader corrects their own clip's title, description, rating or category. */
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateMediaDto) {
    return this.mediaService.update(user.userId, id, dto);
  }

  /** Removes one of your own clips. The previous one in that category becomes
   *  the current claim again. */
  /** A verified coach replaces the rating on a clip they have watched. */
  @Patch(':id/rating')
  rate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RateMediaDto) {
    return this.mediaService.rate(user.userId, id, dto);
  }

  /** What that rating was before each change. Gated like the clip itself. */
  @Get(':id/rating/history')
  ratingHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mediaService.ratingHistory(id, user.userId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mediaService.remove(user.userId, id);
  }

  @Post(':id/like')
  like(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mediaService.like(user.userId, id);
  }

  @Delete(':id/like')
  unlike(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.mediaService.unlike(user.userId, id);
  }

  // ---- Views (1.14). Public: guests may view public media (1.2), so the view
  // counter must accept them; @OptionalUser attributes it when a token is present.

  // Unauthenticated *and* it writes a row, which is the combination worth being
  // careful about. The service also claims one view per viewer per hour, so this
  // number bounds the requests and that bounds what they can persist.
  @Throttle({ limit: 60, windowSeconds: 60 })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(':id/view')
  recordView(
    @Param('id') id: string,
    @ClientInfoParam() client: ClientInfo,
    @OptionalUser() userId?: string,
  ) {
    return this.mediaService.recordView(id, { userId, ipAddress: client.ipAddress });
  }

  /** Counts, plus `likedByMe` when a token is present — one like per account. */
  @Public()
  @Get(':id/engagement')
  getEngagement(@Param('id') id: string, @OptionalUser() userId?: string) {
    return this.mediaService.getEngagement(id, userId);
  }

  // ---- Comments (1.14) ----

  @Post(':id/comments')
  comment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateMediaCommentDto,
  ) {
    return this.mediaService.comment(user.userId, id, dto);
  }

  @Public()
  @Get(':id/comments')
  listComments(@Param('id') id: string, @Query() dto: ListMediaCommentsDto) {
    return this.mediaService.listComments(id, dto);
  }

  @Delete('comments/:commentId')
  deleteComment(@CurrentUser() user: AuthUser, @Param('commentId') commentId: string) {
    return this.mediaService.deleteComment(user.userId, commentId);
  }
}
