import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import {
  AvatarUploadUrlDto,
  RequestContactChangeDto,
  UpdateProfileDto,
  VerifyContactChangeDto,
} from './dto/user.dto';

@ApiTags('users')
@ApiBearerAuth('bearer')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.usersService.findMe(user.userId);
  }

  /** Identity + roles + per-role counters for the profile screen, in one request. */
  @Get('me/profile')
  myProfile(@CurrentUser() user: AuthUser) {
    return this.usersService.findMeWithStats(user.userId);
  }

  /**
   * Become a scout — the one role a user may give themselves.
   *
   * Everything else is granted by somebody: `player` comes with creating a
   * profile, `coach` from the academy that hires you, `academy_manager` and
   * `admin` from an admin. Scouting needs no permission because it starts with
   * zero authority: a new scout's recommendations carry the lowest §1.5 weight
   * and only earn more by being accepted.
   */
  @HttpCode(HttpStatus.OK)
  @Post('me/roles/scout')
  becomeScout(@CurrentUser() user: AuthUser) {
    return this.usersService.becomeScout(user.userId);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.userId, dto);
  }

  @Post('me/avatar/upload-url')
  avatarUploadUrl(@CurrentUser() user: AuthUser, @Body() dto: AvatarUploadUrlDto) {
    return this.usersService.avatarUploadUrl(user.userId, dto);
  }

  /** Step 1 of changing a phone or email: prove you control the new destination. */
  @HttpCode(HttpStatus.OK)
  @Post('me/contact/request')
  requestContactChange(@CurrentUser() user: AuthUser, @Body() dto: RequestContactChangeDto) {
    return this.usersService.requestContactChange(user.userId, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('me/contact/verify')
  verifyContactChange(@CurrentUser() user: AuthUser, @Body() dto: VerifyContactChangeDto) {
    return this.usersService.verifyContactChange(user.userId, dto);
  }

  /**
   * The "who am I here" block behind the avatar menu — see UsersService.summary.
   *
   * Not `@Public()`, though it was. `@CurrentUser()` reads `request.user`, which
   * the auth guard leaves unset on a public route, so an unauthenticated call
   * reached Prisma with `userId: undefined` and answered 500. There is nothing
   * for a guest here in any case: every field describes an account.
   */
  @Get('me/summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.usersService.summary(user.userId);
  }

  @Get(':id')
  publicProfile(@Param('id') id: string, @CurrentUser() viewer?: AuthUser) {
    return this.usersService.findPublicProfile(id, viewer);
  }
}
