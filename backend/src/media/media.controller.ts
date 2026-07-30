import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { MediaService } from './media.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { OptionalUser } from '../common/decorators/optional-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import {
  ConfirmUploadDto,
  CreateMediaCommentDto,
  ListMediaCommentsDto,
  RequestUploadDto,
} from './dto/media.dto';

@ApiTags('media')
@ApiBearerAuth('bearer')
@Controller('media')
export class MediaController {
  constructor(private mediaService: MediaService) {}

  @Post('upload-url')
  requestUpload(@CurrentUser() user: AuthUser, @Body() dto: RequestUploadDto) {
    return this.mediaService.requestUpload(user.userId, dto);
  }

  @Post('confirm')
  confirmUpload(@CurrentUser() user: AuthUser, @Body() dto: ConfirmUploadDto) {
    return this.mediaService.confirmUpload(user.userId, dto);
  }

  @Public()
  @Get('player/:playerId')
  listForPlayer(@Param('playerId') playerId: string) {
    return this.mediaService.listForPlayer(playerId);
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

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(':id/view')
  recordView(@Param('id') id: string, @OptionalUser() userId?: string) {
    return this.mediaService.recordView(id, userId);
  }

  @Public()
  @Get(':id/engagement')
  getEngagement(@Param('id') id: string) {
    return this.mediaService.getEngagement(id);
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
