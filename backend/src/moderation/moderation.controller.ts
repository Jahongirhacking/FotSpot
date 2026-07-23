import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateReportDto, ResolveReportDto } from './dto/moderation.dto';

@Controller('moderation')
export class ModerationController {
  constructor(private moderationService: ModerationService) {}

  @Post('reports')
  fileReport(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.moderationService.fileReport(user.userId, dto);
  }

  @Roles('admin', 'super_admin')
  @Get('reports/pending')
  listPending() {
    return this.moderationService.listPending();
  }

  @Roles('admin', 'super_admin')
  @Patch('reports/:id/resolve')
  resolve(@Param('id') id: string, @Body() dto: ResolveReportDto) {
    return this.moderationService.resolve(id, dto);
  }

  @Roles('admin', 'super_admin')
  @Patch('media/:id/flag')
  flagMedia(@Param('id') id: string) {
    return this.moderationService.flagMedia(id);
  }
}
