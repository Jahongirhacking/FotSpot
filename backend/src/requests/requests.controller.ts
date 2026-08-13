import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Throttle } from '../common/decorators/throttle.decorator';
import { ClientInfo, ClientInfoParam } from '../common/decorators/client-info.decorator';
import { AuthService } from '../auth/auth.service';
import {
  CreateSupportRequestDto,
  RequestAccountDeletionDto,
  ListSupportRequestsDto,
  UpdateSupportRequestDto,
} from './dto/request.dto';

@ApiTags('requests')
@ApiBearerAuth('bearer')
@Controller('requests')
export class RequestsController {
  constructor(
    private requests: RequestsService,
    private auth: AuthService,
  ) {}

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

  /**
   * Ask for an account to be deleted, from the public privacy page.
   *
   * Public, and therefore credential-checked: the caller proves the password
   * before anything is queued. Rate limited per IP on its own counter — a burst
   * here is somebody trying to get a stranger's account erased, which is a
   * different attack from guessing a way in, and it must not lock the same
   * address out of signing in.
   */
  @Throttle({ limit: 10, windowSeconds: 60 })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('delete-account')
  async requestAccountDeletion(
    @Body() dto: RequestAccountDeletionDto,
    @ClientInfoParam() client: ClientInfo,
  ) {
    const user = await this.auth.verifyPasswordOnly(dto, client);
    return this.requests.requestDeletionWithPassword(user.id, dto.message);
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
