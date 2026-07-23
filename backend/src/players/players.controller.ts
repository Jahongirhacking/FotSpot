import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PlayersService } from './players.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import {
  CreatePlayerProfileDto,
  SearchPlayersDto,
  UpdatePlayerProfileDto,
  UpdatePlayerStatsDto,
} from './dto/player.dto';

@Controller('players')
export class PlayersController {
  constructor(private playersService: PlayersService) {}

  // Any authenticated Scout can create their own Player profile (1.2: Player is an "additional role").
  @Post('me')
  createProfile(@CurrentUser() user: AuthUser, @Body() dto: CreatePlayerProfileDto) {
    return this.playersService.createProfile(user.userId, dto);
  }

  @Get('me')
  getOwnProfile(@CurrentUser() user: AuthUser) {
    return this.playersService.getOwnProfile(user.userId);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdatePlayerProfileDto) {
    return this.playersService.updateProfile(user.userId, dto);
  }

  @Patch('me/stats')
  updateStats(@CurrentUser() user: AuthUser, @Body() dto: UpdatePlayerStatsDto) {
    return this.playersService.updateStats(user.userId, dto);
  }

  @Public()
  @Get('search')
  search(@Query() dto: SearchPlayersDto) {
    return this.playersService.search(dto);
  }

  @Public()
  @Get(':id')
  getPublicProfile(@Param('id') id: string) {
    return this.playersService.getPublicProfile(id);
  }
}
