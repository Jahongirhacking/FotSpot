import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { FollowTargetType } from '@prisma/client';
import { FollowsService } from './follows.service';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateFollowDto, ListFollowsDto, SetScoutFollowStateDto } from './dto/follow.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('follows')
@ApiBearerAuth('bearer')
@Controller('follows')
export class FollowsController {
  constructor(private followsService: FollowsService) {}

  // ---- Scout -> player / academy (1.2) ----

  @Post()
  follow(@CurrentUser() user: AuthUser, @Body() dto: CreateFollowDto) {
    return this.followsService.follow(user.userId, dto);
  }

  @Delete()
  unfollow(@CurrentUser() user: AuthUser, @Body() dto: CreateFollowDto) {
    return this.followsService.unfollow(user.userId, dto);
  }

  /**
   * Who follows you — people following your player card, and academies following
   * you as a scout, in one list because they are one question.
   */
  @Get('followers')
  listFollowers(@CurrentUser() user: AuthUser) {
    return this.followsService.listFollowers(user.userId);
  }

  @Get('me')
  listMine(@CurrentUser() user: AuthUser, @Query() dto: ListFollowsDto) {
    return this.followsService.listFollowing(user.userId, dto);
  }

  /**
   * Whether the caller follows one specific thing.
   *
   * A page showing a follow button needs one boolean, and the alternatives are
   * both wrong for it: `GET /follows/me` pages through everything the caller
   * follows, so the answer for an academy on page three is "no" until somebody
   * scrolls, and counting followers says how many without saying whether you are
   * one of them.
   *
   * Not `@Public()`. The question is "do *I* follow this", which needs a caller
   * to be about — a guest gets 401 rather than a `false` they could mistake for
   * a state they can toggle.
   */
  @Get('status/:targetType/:targetId')
  status(
    @CurrentUser() user: AuthUser,
    @Param('targetType') targetType: FollowTargetType,
    @Param('targetId') targetId: string,
  ) {
    return this.followsService.status(user.userId, targetType, targetId);
  }

  @Public()
  @Get('count/:targetType/:targetId')
  countFollowers(
    @Param('targetType') targetType: FollowTargetType,
    @Param('targetId') targetId: string,
  ) {
    return this.followsService.countFollowers(targetType, targetId);
  }

  // ---- Academy -> scout trust (1.5.2) ----

  @Put('academy/:academyId/scouts')
  setScoutFollowState(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
    @Body() dto: SetScoutFollowStateDto,
  ) {
    return this.followsService.setScoutFollowState(user.userId, academyId, dto);
  }

  @Delete('academy/:academyId/scouts/:scoutId')
  clearScoutFollowState(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
    @Param('scoutId') scoutId: string,
  ) {
    return this.followsService.clearScoutFollowState(user.userId, academyId, scoutId);
  }

  @Get('academy/:academyId/scouts')
  listScoutNetwork(@CurrentUser() user: AuthUser, @Param('academyId') academyId: string) {
    return this.followsService.listScoutNetwork(user.userId, academyId);
  }

  /** A scout's own follower academies - status, not a leaderboard (1.5.2). */
  @Get('me/academies')
  listMyFollowerAcademies(@CurrentUser() user: AuthUser) {
    return this.followsService.listAcademiesFollowingScout(user.userId);
  }
}
