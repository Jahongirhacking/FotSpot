import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
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

  @Public()
  @Get(':id')
  publicProfile(@Param('id') id: string) {
    return this.usersService.findPublicProfile(id);
  }
}
