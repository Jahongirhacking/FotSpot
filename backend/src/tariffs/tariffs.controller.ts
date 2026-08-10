import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Param, ParseEnumPipe, Patch } from '@nestjs/common';
import { PlanTier } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateTariffPlanDto } from './dto/tariff.dto';
import { TariffsService } from './tariffs.service';

@ApiTags('tariffs')
@ApiBearerAuth('bearer')
@Controller('tariff-plans')
export class TariffsController {
  constructor(private tariffs: TariffsService) {}

  /**
   * The three tiers and their limits.
   *
   * Readable by any signed-in account, not just admins: the numbers are what a
   * player is told when an upload is refused, and a limit nobody can look up is
   * a limit that reads as a bug.
   */
  @Get()
  list() {
    return this.tariffs.list();
  }

  /** The caller's own plan and how much of it they have used. */
  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.tariffs.myUsage(user.userId, user.heldRoles ?? user.roles);
  }

  /**
   * Edit one tier's numbers — **super admin only** (§1.2: feature flags and
   * platform-wide settings are not a plain admin's power).
   */
  @Roles('super_admin')
  @ApiParam({ name: 'tier', enum: PlanTier, enumName: 'PlanTier' })
  @Patch(':tier')
  update(
    @CurrentUser() user: AuthUser,
    @Param('tier', new ParseEnumPipe(PlanTier)) tier: PlanTier,
    @Body() dto: UpdateTariffPlanDto,
  ) {
    return this.tariffs.update(user.userId, tier, dto);
  }
}
