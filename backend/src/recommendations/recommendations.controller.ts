import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateRecommendationDto, UpdateRecommendationStatusDto } from './dto/recommendation.dto';
import { AssignReviewDto, InvitePlayerDto, ReviewDecisionDto } from './dto/review.dto';
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

  /** What this academy already settled — invited or turned down. */
  @Get('academy/:academyId/history')
  listHistoryForAcademy(@CurrentUser() user: AuthUser, @Param('academyId') academyId: string) {
    return this.recommendationsService.listHistoryForAcademy(user.userId, academyId);
  }

  /** This scout's own recommendation for a player — one per player (§1.5). */
  @Get('player/:playerId/mine')
  myRecommendationFor(@CurrentUser() user: AuthUser, @Param('playerId') playerId: string) {
    return this.recommendationsService.myRecommendationFor(user.userId, playerId);
  }

  /** Where a player stands with the academy this manager runs. */
  @Get('player/:playerId/academy-state')
  academyStateFor(@CurrentUser() user: AuthUser, @Param('playerId') playerId: string) {
    return this.recommendationsService.academyStateFor(user.userId, playerId);
  }

  // ---------- Coach review (§1.9) ----------

  /**
   * Hand a player to an endorsed coach. Omit the coach and one is picked from the
   * endorsed pool by who is carrying the fewest open reviews.
   *
   * Keyed on the player, not a recommendation: an academy may review anybody it
   * has found, and a scout's recommendation only decides who appears in the inbox.
   */
  @Post('players/:playerId/review')
  assignReview(
    @CurrentUser() user: AuthUser,
    @Param('playerId') playerId: string,
    @Body() dto: AssignReviewDto,
  ) {
    return this.recommendationsService.assignReview(user.userId, playerId, dto);
  }

  /**
   * This coach's review of one player, or null if nobody gave them that player.
   *
   * Lets a coach answer from the profile they are reading rather than hunting
   * the same person down in their queue. Null is the rule, not an empty state:
   * a coach may only judge players an academy assigned to them.
   */
  @Get('player/:playerId/my-review')
  myReviewFor(@CurrentUser() user: AuthUser, @Param('playerId') playerId: string) {
    return this.recommendationsService.myReviewFor(user.userId, playerId);
  }

  /** A coach's own queue. Declared before `:id` — Nest matches in order. */
  @Get('reviews/mine')
  listMyReviews(@CurrentUser() user: AuthUser, @Query('status') status?: 'PENDING' | 'DECIDED') {
    return this.recommendationsService.listMyReviews(user.userId, status ?? 'PENDING');
  }

  /** The coach's verdict, and the ratings that become the player's credible ones. */
  @Post('reviews/:reviewId/decision')
  decideReview(
    @CurrentUser() user: AuthUser,
    @Param('reviewId') reviewId: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.recommendationsService.decideReview(user.userId, reviewId, dto);
  }

  /** The manager invites an approved player, with a note they will read. */
  @Post('players/:playerId/invite')
  invitePlayer(
    @CurrentUser() user: AuthUser,
    @Param('playerId') playerId: string,
    @Body() dto: InvitePlayerDto,
  ) {
    return this.recommendationsService.invitePlayer(user.userId, playerId, dto);
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
