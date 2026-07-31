import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InsightsService } from './insights.service';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * Recruiting-side activity summaries.
 *
 * **`player` is deliberately absent from every @Roles list here.** These endpoints
 * order players by how much scout attention they drew, and §21.4 is explicit that a
 * child must only ever see progress against their own past self — never their place
 * in a ranking of other children. Excluding the role is the enforcement; the rest is
 * framing.
 */
@ApiTags('insights')
@ApiBearerAuth('bearer')
@Controller('insights')
export class InsightsController {
  constructor(private insights: InsightsService) {}

  /** Most-backed players, most-accepted scouts and most-active coaches this week. */
  @Roles('academy_manager', 'scout', 'coach', 'admin', 'super_admin')
  @Get('weekly')
  weekly() {
    return this.insights.weekly();
  }

  /** Inbox, endorsement and trial counters for one academy's home screen. */
  @Roles('academy_manager', 'admin', 'super_admin')
  @Get('academy/:academyId')
  academySummary(@Param('academyId') academyId: string) {
    return this.insights.academySummary(academyId);
  }
}
