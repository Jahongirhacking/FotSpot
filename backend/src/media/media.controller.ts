import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { MediaService } from './media.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ConfirmUploadDto, RequestUploadDto } from './dto/media.dto';

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
}
