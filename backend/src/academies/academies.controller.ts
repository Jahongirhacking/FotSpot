import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AcademyMemberRole } from '@prisma/client';
import { AcademiesService } from './academies.service';
import { EndorsementsService } from './endorsements.service';
import { GroupsService } from './groups.service';
import { ListEndorsementsDto } from './dto/endorsement.dto';
import { InvitationsService } from './invitations.service';
import { InviteMemberDto } from './dto/invitation.dto';
import {
  CreateGroupDto,
  ListCandidatesDto,
  MoveMembersDto,
  RequestTransferDto,
  UpdateGroupDto,
} from './dto/group.dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AddAcademyPhotoDto,
  AcademyImageUploadDto,
  ReorderDto,
  SetFeaturedDto,
  CreateCoachDto,
  ImportMemberDto,
  ListMembersDto,
  UpdateMemberDto,
  CreateAcademyDto,
  SetManagerDto,
  UpdateAcademyDto,
} from './dto/academy.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('academies')
@ApiBearerAuth('bearer')
@Controller('academies')
export class AcademiesController {
  constructor(
    private academiesService: AcademiesService,
    private endorsements: EndorsementsService,
    private groups: GroupsService,
    private invitations: InvitationsService,
  ) {}

  /**
   * Admin-only. There are roughly fifty academies in Uzbekistan, so they are
   * onboarded by the platform team rather than self-registered — see
   * AcademiesService.register for the reasoning.
   */
  @Roles('admin', 'super_admin')
  @Post()
  register(@CurrentUser() user: AuthUser, @Body() dto: CreateAcademyDto) {
    return this.academiesService.register(user.userId, dto);
  }

  @Public()
  @Get()
  listPublic(@Query('region') region?: string) {
    return this.academiesService.listPublic(region);
  }

  /**
   * The academy the caller manages, or null.
   *
   * Declared before `:id` — Nest matches routes in declaration order, so putting
   * this after would make `/academies/mine` resolve as an academy whose id is the
   * literal string "mine".
   */
  @Get('mine')
  findMine(@CurrentUser() user: AuthUser) {
    return this.academiesService.findMine(user.userId);
  }

  @Public()
  @Get(':id')
  getPublicProfile(@Param('id') id: string) {
    return this.academiesService.getPublicProfile(id);
  }

  /**
   * What the caller is to this academy — manager, staff, endorsed, or a player it
   * accepted at a trial. Drives the "My academy" badge.
   */
  @Get(':id/relation')
  relation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academiesService.relationTo(user.userId, id);
  }

  /**
   * Assigns or replaces the academy's single manager (admin only). Either names an
   * existing user or mints an account, returning its one-time credentials once.
   */
  @Roles('admin', 'super_admin')
  @Patch(':id/manager')
  setManager(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetManagerDto) {
    return this.academiesService.setManager(user.userId, id, dto);
  }

  /** Issues the manager a fresh one-time password (admin only). */
  @Roles('admin', 'super_admin')
  @Post(':id/manager/reset-password')
  resetManagerPassword(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academiesService.resetManagerPassword(user.userId, id);
  }

  /** Manager edits their own; an admin may correct any (§1.10). */
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAcademyDto) {
    const isAdmin = user.roles.includes('admin') || user.roles.includes('super_admin');
    return this.academiesService.update(user.userId, id, dto, isAdmin);
  }

  /**
   * Archives an academy (admin only). Sets status REJECTED rather than deleting —
   * a hard delete would cascade through trials, applications and recommendation
   * history. See AcademiesService.archive.
   */
  @Roles('admin', 'super_admin')
  @Delete(':id')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academiesService.archive(user.userId, id);
  }

  /** Every academy including pending/archived — admin console list. */
  @Roles('admin', 'super_admin')
  @Get('admin/all')
  listAll() {
    return this.academiesService.listAll();
  }

  /**
   * Add a coach: an existing account, or a new one minted with credentials the
   * manager hands over — the same two paths an admin has for a manager.
   *
   * Credentials come back exactly once and are never retrievable again.
   */
  @Post(':id/coaches')
  createCoach(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateCoachDto) {
    return this.academiesService.createCoach(user.userId, id, dto);
  }

  // ---------- Groups (§1.10) ----------

  /** The academy's squads, plus how many are in the reserve. */
  @Public()
  @Get(':id/groups')
  listGroups(@Param('id') id: string) {
    return this.groups.list(id);
  }

  /** A coach's own groups — declared before `:id/groups/:groupId`. */
  @Get('groups/mine')
  myGroups(@CurrentUser() user: AuthUser) {
    return this.groups.listForCoach(user.userId);
  }

  @Public()
  @Get('groups/:groupId')
  getGroup(@Param('groupId') groupId: string) {
    return this.groups.getById(groupId);
  }

  @Post(':id/groups')
  createGroup(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateGroupDto) {
    return this.groups.create(user.userId, id, dto);
  }

  @Patch('groups/:groupId')
  updateGroup(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groups.update(user.userId, groupId, dto);
  }

  /** Deleting a group returns its people to the reserve; it removes nobody. */
  @Delete('groups/:groupId')
  deleteGroup(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return this.groups.remove(user.userId, groupId);
  }

  /** Move members into a group, or back to the reserve by omitting `groupId`. */
  @Post(':id/groups/move')
  moveMembers(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MoveMembersDto) {
    return this.groups.moveMembers(user.userId, id, dto);
  }

  /**
   * Accounts this academy could add for a role — declared before `:id/transfers`.
   *
   * Paged and searchable: the picker on the squad screen is a window onto every
   * account holding that role, and there are far more of those than fit a list.
   */
  @Get(':id/candidates')
  joinCandidates(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() dto: ListCandidatesDto,
  ) {
    return this.groups.listJoinCandidates(user.userId, id, dto.role ?? 'PLAYER', dto);
  }

  // ---------- Invitations to join ----------

  /**
   * Ask somebody to join. Nothing is written to their record until they accept —
   * see InvitationsService for why an academy cannot simply add people.
   */
  @Post(':id/invitations')
  invite(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: InviteMemberDto) {
    return this.invitations.invite(user.userId, id, dto);
  }

  /** What this academy has asked of people, answered or not. */
  @Get(':id/invitations')
  listAcademyInvitations(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invitations.listForAcademy(user.userId, id);
  }

  /** Invitations addressed to me — declared before `:id` cannot catch it. */
  @Get('invitations/mine')
  listMyInvitations(@CurrentUser() user: AuthUser) {
    return this.invitations.listMine(user.userId);
  }

  @Post('invitations/:invitationId/accept')
  acceptInvitation(@CurrentUser() user: AuthUser, @Param('invitationId') invitationId: string) {
    return this.invitations.decide(user.userId, invitationId, true);
  }

  @Post('invitations/:invitationId/reject')
  rejectInvitation(@CurrentUser() user: AuthUser, @Param('invitationId') invitationId: string) {
    return this.invitations.decide(user.userId, invitationId, false);
  }

  /** The academy withdrawing a question nobody has answered yet. */
  @Post('invitations/:invitationId/cancel')
  cancelInvitation(@CurrentUser() user: AuthUser, @Param('invitationId') invitationId: string) {
    return this.invitations.cancel(user.userId, invitationId);
  }

  // ---------- Transfers between academies ----------

  /** Offer a member to another academy. Nothing moves until they answer. */
  @Post(':id/transfers')
  requestTransfer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RequestTransferDto,
  ) {
    return this.groups.requestTransfer(user.userId, id, dto);
  }

  /** Offers made, or offers waiting on this academy's answer. */
  @Get(':id/transfers')
  listTransfers(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('direction') direction: 'incoming' | 'outgoing' = 'incoming',
  ) {
    return this.groups.listTransfers(user.userId, id, direction);
  }

  /** The receiving academy accepts — the member lands in their reserve. */
  @Post('transfers/:transferId/approve')
  approveTransfer(@CurrentUser() user: AuthUser, @Param('transferId') transferId: string) {
    return this.groups.decideTransfer(user.userId, transferId, true);
  }

  @Post('transfers/:transferId/reject')
  rejectTransfer(@CurrentUser() user: AuthUser, @Param('transferId') transferId: string) {
    return this.groups.decideTransfer(user.userId, transferId, false);
  }

  /** The offering academy withdraws before the other side answers. */
  @Post('transfers/:transferId/cancel')
  cancelTransfer(@CurrentUser() user: AuthUser, @Param('transferId') transferId: string) {
    return this.groups.cancelTransfer(user.userId, transferId);
  }

  /** The roster: coaches, scouts and the squad, players sorted by assessed rating. */
  @Public()
  @Get(':id/members')
  listMembers(@Param('id') id: string, @Query() dto: ListMembersDto) {
    return this.academiesService.listMembers(id, dto);
  }

  /** Edit a membership or stand it down. There is no delete — see the service. */
  @Patch(':id/members/:memberId')
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.academiesService.updateMember(user.userId, id, memberId, dto);
  }

  /** Let a member go, so another academy can take them on. */
  @Post(':id/members/:memberId/release')
  releaseMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    return this.academiesService.releaseMember(user.userId, id, memberId);
  }

  /** Everyone any academy has released — declared before `:id` routes. */
  @Get('transfers/available')
  listTransferMarket(@Query('role') role?: AcademyMemberRole) {
    return this.academiesService.listTransferMarket(role);
  }

  /** Take on someone another academy released. */
  @Post(':id/members/import')
  importMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ImportMemberDto,
  ) {
    return this.academiesService.importMember(user.userId, id, dto);
  }

  @Get(':id/staff')
  listStaff(@Param('id') id: string) {
    return this.academiesService.listStaff(id);
  }

  // ---- Endorsements (README 1.5.3) ----

  /**
   * This academy's endorsed scouts and coaches.
   *
   * Read-only: endorsement is no longer something a manager grants on a screen
   * of its own. Joining the academy as a coach or a scout *is* the endorsement,
   * and being expelled withdraws it — one act, one place, no second mechanism to
   * drift out of step with the first.
   */
  /**
   * A presigned PUT for the academy's logo or a gallery photo.
   *
   * The key is minted from the academy id server-side; nothing the client sends
   * can steer where the object lands.
   */
  @Post(':id/images/upload-url')
  imageUploadUrl(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AcademyImageUploadDto,
  ) {
    return this.academiesService.imageUploadUrl(user.userId, id, dto.filename);
  }

  /** The gallery, in the order the manager arranged it. Public. */
  @Public()
  @Get(':id/photos')
  listPhotos(@Param('id') id: string) {
    return this.academiesService.listPhotos(id);
  }

  @Post(':id/photos')
  addPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddAcademyPhotoDto,
  ) {
    return this.academiesService.addPhoto(user.userId, id, dto);
  }

  @Patch(':id/photos/order')
  reorderPhotos(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReorderDto) {
    return this.academiesService.reorderPhotos(user.userId, id, dto.ids);
  }

  @Delete('photos/:photoId')
  removePhoto(@CurrentUser() user: AuthUser, @Param('photoId') photoId: string) {
    return this.academiesService.removePhoto(user.userId, photoId);
  }

  /** Who the academy features — its top players, coaches and scouts. Public. */
  @Public()
  @Get(':id/featured')
  listFeatured(@Param('id') id: string) {
    return this.academiesService.listFeatured(id);
  }

  /** Replaces one role's list outright — see `setFeatured` for why wholesale. */
  @Put(':id/featured')
  setFeatured(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetFeaturedDto,
  ) {
    return this.academiesService.setFeatured(user.userId, id, dto);
  }

  @Get(':id/endorsements')
  listEndorsements(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() dto: ListEndorsementsDto,
  ) {
    return this.endorsements.listForAcademy(user.userId, id, dto.role);
  }
}
