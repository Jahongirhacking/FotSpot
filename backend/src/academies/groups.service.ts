import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.actions';
import {
  CreateGroupDto,
  MoveMembersDto,
  RequestTransferDto,
  UpdateGroupDto,
} from './dto/group.dto';

/**
 * Squads inside an academy, and moving people between them.
 *
 * ## Reserve is not a group
 *
 * It is `groupId = null`. Everyone who joins an academy is in it without anybody
 * having to put them there, and moving somebody back is clearing a field rather
 * than looking up a group by a magic name — which is the kind of lookup that
 * breaks the day a manager renames it.
 *
 * ## Only the manager cuts the squads
 *
 * A coach works with the group they are given (§1.10). If they could rename or
 * re-cut it, "who is in my group" would be a moving answer and the assessments
 * attached to it would stop meaning anything.
 */
@Injectable()
export class GroupsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

  async list(academyId: string) {
    const groups = await this.prisma.academyGroup.findMany({
      where: { academyId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });

    // The reserve is a real part of the squad list even though it is not a row,
    // so the count comes back with the groups rather than being another request.
    const reserve = await this.prisma.academyMember.count({
      where: { academyId, groupId: null, status: 'ACTIVE' },
    });

    return {
      groups: groups.map(({ imageKey, _count, ...group }) => ({
        ...group,
        imageUrl: this.storage.publicUrlOrNull(imageKey),
        memberCount: _count.members,
      })),
      reserveCount: reserve,
    };
  }

  /** One group with its people, for the manager's editor and the coach's screen. */
  async getById(groupId: string) {
    const group = await this.prisma.academyGroup.findUnique({
      where: { id: groupId },
      include: {
        academy: { select: { id: true, name: true } },
        members: {
          where: { status: { not: 'RELEASED' } },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                username: true,
                avatarKey: true,
                playerProfile: { select: { id: true, primaryPosition: true, birthDate: true } },
              },
            },
          },
        },
      },
    });
    if (!group) throw new NotFoundException('Group not found');

    const { imageKey, members, ...rest } = group;
    return {
      ...rest,
      imageUrl: this.storage.publicUrlOrNull(imageKey),
      members: members.map(({ user, ...member }) => ({
        id: member.id,
        role: member.role,
        status: member.status,
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        avatarUrl: this.storage.publicUrlOrNull(user.avatarKey),
        playerId: user.playerProfile?.id ?? null,
        primaryPosition: user.playerProfile?.primaryPosition ?? null,
        birthDate: user.playerProfile?.birthDate ?? null,
      })),
    };
  }

  /** The groups this coach has been given, for "My group". */
  async listForCoach(userId: string) {
    const memberships = await this.prisma.academyMember.findMany({
      where: { userId, role: 'COACH', status: 'ACTIVE', groupId: { not: null } },
      select: { groupId: true },
    });
    const ids = memberships.map((row) => row.groupId).filter((id): id is string => !!id);
    if (ids.length === 0) return [];

    return Promise.all(ids.map((id) => this.getById(id)));
  }

  async create(userId: string, academyId: string, dto: CreateGroupDto) {
    await this.assertManager(userId, academyId);

    try {
      const group = await this.prisma.academyGroup.create({
        data: {
          academyId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          imageKey: dto.imageKey ?? null,
        },
      });
      await this.audit.record(userId, AuditAction.ACADEMY_GROUP_CREATED, {
        academyId,
        groupId: group.id,
        name: group.name,
      });
      return group;
    } catch (error) {
      // Two squads called "U14" in one academy is a mistake, not a plan.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A group with that name already exists');
      }
      throw error;
    }
  }

  async update(userId: string, groupId: string, dto: UpdateGroupDto) {
    const group = await this.prisma.academyGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');
    await this.assertManager(userId, group.academyId);

    return this.prisma.academyGroup.update({
      where: { id: groupId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.imageKey !== undefined ? { imageKey: dto.imageKey || null } : {}),
      },
    });
  }

  /**
   * Deleting a group returns its people to the reserve rather than removing them.
   *
   * `onDelete: SetNull` already does that at the database level; it is spelled
   * out here because "delete the U14s" must never read as "delete the under-14s".
   */
  async remove(userId: string, groupId: string) {
    const group = await this.prisma.academyGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');
    await this.assertManager(userId, group.academyId);

    await this.prisma.academyGroup.delete({ where: { id: groupId } });
    await this.audit.record(userId, AuditAction.ACADEMY_GROUP_DELETED, {
      academyId: group.academyId,
      groupId,
      name: group.name,
    });
    return { deleted: true, membersReturnedToReserve: true };
  }

  /**
   * Move people into a group, or back to the reserve with `groupId: null`.
   *
   * Takes a list because a manager sorting a new intake is moving eight players
   * at once, and eight round trips is how a screen ends up half-applied when one
   * of them fails.
   */
  async moveMembers(userId: string, academyId: string, dto: MoveMembersDto) {
    await this.assertManager(userId, academyId);

    if (dto.groupId) {
      const group = await this.prisma.academyGroup.findUnique({ where: { id: dto.groupId } });
      if (!group || group.academyId !== academyId) {
        throw new BadRequestException('That group belongs to another academy');
      }
    }

    const { count } = await this.prisma.academyMember.updateMany({
      // Scoped to this academy: a member id from somewhere else must not be
      // movable by pasting it into the list.
      where: { id: { in: dto.memberIds }, academyId },
      data: { groupId: dto.groupId ?? null },
    });

    await this.audit.record(userId, AuditAction.ACADEMY_GROUP_MEMBERS_MOVED, {
      academyId,
      groupId: dto.groupId ?? null,
      moved: count,
    });
    return { moved: count };
  }

  // ---------- Transfers between academies ----------

  /**
   * Offer a member to another academy.
   *
   * Nothing moves yet. The receiving academy decides, and until it does the
   * member stays where they are and keeps their group — an offer nobody has
   * answered should not leave a player in limbo.
   */
  async requestTransfer(userId: string, academyId: string, dto: RequestTransferDto) {
    await this.assertManager(userId, academyId);

    const member = await this.prisma.academyMember.findUnique({ where: { id: dto.memberId } });
    if (!member || member.academyId !== academyId) throw new NotFoundException('Member not found');
    if (member.role === 'MANAGER') throw new BadRequestException('A manager cannot be transferred');
    if (dto.toAcademyId === academyId) {
      throw new BadRequestException('That is the academy they are already at');
    }

    const destination = await this.prisma.academyProfile.findUnique({
      where: { id: dto.toAcademyId },
      select: { id: true },
    });
    if (!destination) throw new BadRequestException('That academy does not exist');

    const open = await this.prisma.memberTransfer.findFirst({
      where: { memberId: dto.memberId, status: 'PENDING' },
    });
    if (open) throw new ConflictException('There is already a transfer waiting on an answer');

    const transfer = await this.prisma.memberTransfer.create({
      data: {
        memberId: dto.memberId,
        fromAcademyId: academyId,
        toAcademyId: dto.toAcademyId,
        note: dto.note?.trim() || null,
        requestedByUserId: userId,
      },
    });

    await this.audit.record(userId, AuditAction.ACADEMY_TRANSFER_REQUESTED, {
      transferId: transfer.id,
      memberId: dto.memberId,
      from: academyId,
      to: dto.toAcademyId,
    });
    return transfer;
  }

  /** Offers this academy has made, and offers it has to answer. */
  async listTransfers(userId: string, academyId: string, direction: 'incoming' | 'outgoing') {
    await this.assertManager(userId, academyId);

    return this.prisma.memberTransfer.findMany({
      where: direction === 'incoming' ? { toAcademyId: academyId } : { fromAcademyId: academyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        fromAcademy: { select: { id: true, name: true } },
        toAcademy: { select: { id: true, name: true } },
        member: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                username: true,
                playerProfile: { select: { id: true, primaryPosition: true } },
              },
            },
          },
        },
      },
    });
  }

  /**
   * The receiving academy answers.
   *
   * On approval the membership moves and lands in the new academy's **reserve**:
   * a squad is a decision about a player you have watched, and an academy that
   * has just taken somebody on has not made it yet.
   */
  async decideTransfer(userId: string, transferId: string, approve: boolean) {
    const transfer = await this.prisma.memberTransfer.findUnique({
      where: { id: transferId },
      include: { member: true },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== 'PENDING') throw new BadRequestException('This is already decided');

    // Only the academy being offered somebody may accept them.
    await this.assertManager(userId, transfer.toAcademyId);

    await this.prisma.$transaction(async (tx) => {
      await tx.memberTransfer.update({
        where: { id: transferId },
        data: {
          status: approve ? 'APPROVED' : 'REJECTED',
          decidedByUserId: userId,
          decidedAt: new Date(),
        },
      });

      if (approve) {
        await tx.academyMember.update({
          where: { id: transfer.memberId },
          data: {
            academyId: transfer.toAcademyId,
            previousAcademyId: transfer.fromAcademyId,
            groupId: null,
            status: 'ACTIVE',
            releasedAt: null,
            joinedAt: new Date(),
          },
        });
      }
    });

    await this.audit.record(userId, AuditAction.ACADEMY_TRANSFER_DECIDED, {
      transferId,
      approved: approve,
      memberId: transfer.memberId,
    });
    return { status: approve ? 'APPROVED' : 'REJECTED' };
  }

  /** The offering academy changes its mind before the other side answers. */
  async cancelTransfer(userId: string, transferId: string) {
    const transfer = await this.prisma.memberTransfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== 'PENDING') throw new BadRequestException('This is already decided');
    await this.assertManager(userId, transfer.fromAcademyId);

    return this.prisma.memberTransfer.update({
      where: { id: transferId },
      data: { status: 'CANCELLED', decidedByUserId: userId, decidedAt: new Date() },
    });
  }

  private async assertManager(userId: string, academyId: string) {
    const membership = await this.prisma.academyMember.findFirst({
      where: { userId, academyId, role: 'MANAGER' },
    });
    if (!membership) throw new ForbiddenException('Only this academy’s manager can do that');
  }
}
