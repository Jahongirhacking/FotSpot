import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateSupportRequestDto,
  ListSupportRequestsDto,
  UpdateSupportRequestDto,
} from './dto/request.dto';

@ApiTags('requests')
@ApiBearerAuth('bearer')
@Controller('requests')
export class RequestsController {
  constructor(private requests: RequestsService) {}

  /**
   * Ask the team for something the app has no button for — deleting the account
   * above all, which the privacy policy states as a right and this is the way to
   * exercise it.
   *
   * Filing the same open request twice returns the first one rather than making a
   * second: pressing a button again is not asking again.
   */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSupportRequestDto) {
    return this.requests.create(user.userId, dto);
  }

  /** What this account has already asked for. */
  @Get('mine')
  listMine(@CurrentUser() user: AuthUser) {
    return this.requests.listMine(user.userId);
  }

  /** The queue, oldest open request first. Carries the contact details, because
   *  the workflow is to get in touch and then act. */
  @Roles('admin', 'super_admin')
  @Get()
  list(@Query() dto: ListSupportRequestsDto) {
    return this.requests.list(dto);
  }

  /** The number on the navbar badge: requests nobody has picked up yet. */
  @Roles('admin', 'super_admin')
  @Get('new-count')
  newCount() {
    return this.requests.newCount();
  }

  /** Pick a request up, or close it with a note saying what was done. */
  @Roles('admin', 'super_admin')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSupportRequestDto,
  ) {
    return this.requests.update(user.userId, id, dto);
  }
}
