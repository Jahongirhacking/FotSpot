import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { CreateRecommendationDto, UpdateRecommendationStatusDto } from './dto/recommendation.dto';

@Controller('recommendations')
export class RecommendationsController {
  constructor(private recommendationsService: RecommendationsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRecommendationDto) {
    return this.recommendationsService.create(user.userId, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() user: AuthUser) {
    return this.recommendationsService.listMine(user.userId);
  }

  @Get('academy/:academyId')
  listForAcademy(@Param('academyId') academyId: string) {
    return this.recommendationsService.listForAcademy(academyId);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRecommendationStatusDto,
  ) {
    return this.recommendationsService.updateStatus(user.userId, id, dto);
  }

  @Get('scout-stats/me')
  myStats(@CurrentUser() user: AuthUser) {
    return this.recommendationsService.getScoutStats(user.userId);
  }
}
