import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  ListProfessionalPlayersDto,
  ProfessionalPlayerImageUploadDto,
  SaveProfessionalPlayerDto,
} from './dto/professional-player.dto';
import { ProfessionalPlayersService } from './professional-players.service';

/**
 * Reading is public — an academy's alumni are shown on its public page, so
 * the directory behind them is too. Writing is an admin's: the records are
 * the platform's own list, not anybody's profile.
 */
@ApiTags('professional-players')
@ApiBearerAuth('bearer')
@Controller('professional-players')
export class ProfessionalPlayersController {
  constructor(private professionalPlayers: ProfessionalPlayersService) {}

  @Public()
  @Get()
  list(@Query() dto: ListProfessionalPlayersDto) {
    return this.professionalPlayers.list(dto);
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.professionalPlayers.get(id);
  }

  @Roles('admin', 'super_admin')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: SaveProfessionalPlayerDto) {
    return this.professionalPlayers.create(user.userId, dto);
  }

  @Roles('admin', 'super_admin')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SaveProfessionalPlayerDto,
  ) {
    return this.professionalPlayers.update(user.userId, id, dto);
  }

  @Roles('admin', 'super_admin')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.professionalPlayers.remove(user.userId, id);
  }

  @Roles('admin', 'super_admin')
  @Post(':id/avatar/upload-url')
  avatarUploadUrl(@Param('id') id: string, @Body() dto: ProfessionalPlayerImageUploadDto) {
    return this.professionalPlayers.avatarUploadUrl(id, dto);
  }
}
