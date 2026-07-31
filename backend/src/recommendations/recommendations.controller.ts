import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateRecommendationDto, UpdateRecommendationStatusDto } from './dto/recommendation.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('recommendations')
@ApiBearerAuth('bearer')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private recommendationsService: RecommendationsService) {}

  /**
   * Files a recommendation. **Scouts only** (§1.5).
   *
   * Recommending is the one action the whole reputation system measures, and it
   * is measured per scout: `ScoutStats`, the §1.5 level tiers and the §1.5.1
   * harmonic credibility all key off a scout identity. A coach or manager filing
   * one would accrue a reputation nothing in the product surfaces, and an
   * academy recommending a player to itself is not a signal at all.
   *
   * Enforced on the acting role, so a scout who is also a coach must be acting
   * as a scout — see JwtStrategy.validate.
   */
  @Roles('scout')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRecommendationDto) {
    return this.recommendationsService.create(user.userId, dto);
  }

  @Roles('scout')
  @Get('mine')
  listMine(@CurrentUser() user: AuthUser) {
    return this.recommendationsService.listMine(user.userId);
  }

  @Get('academy/:academyId')
  listForAcademy(@Param('academyId') academyId: string) {
    return this.recommendationsService.listForAcademy(academyId);
  }

  /** Manager-only: same inbox ranked by per-academy credibility (1.5.1/1.5.2). */
  @Get('academy/:academyId/ranked')
  listRankedForAcademy(@CurrentUser() user: AuthUser, @Param('academyId') academyId: string) {
    return this.recommendationsService.listRankedForAcademy(user.userId, academyId);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRecommendationStatusDto,
  ) {
    return this.recommendationsService.updateStatus(user.userId, id, dto);
  }

  /**
   * A player's recommendation record: who vouched for them, with what weight, and
   * the decayable public `globalWeight`. Per-academy extras stay in the inbox.
   */
  @Public()
  @Get('player/:playerId')
  playerSummary(@Param('playerId') playerId: string) {
    return this.recommendationsService.playerRecommendationSummary(playerId);
  }

  /**
   * Academies that currently endorse me — the only valid targets for a SPECIFIC
   * recommendation. Drives the picker, so it can only ever offer valid choices.
   */
  @Roles('scout')
  @Get('endorsing-academies')
  endorsingAcademies(@CurrentUser() user: AuthUser) {
    return this.recommendationsService.endorsingAcademies(user.userId);
  }

  @Roles('scout')
  @Get('scout-stats/me')
  myStats(@CurrentUser() user: AuthUser) {
    return this.recommendationsService.getScoutStats(user.userId);
  }
}
