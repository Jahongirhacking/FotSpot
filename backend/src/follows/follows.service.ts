import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AcademyScoutFollowState, FollowTargetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateFollowDto, ListFollowsDto, SetScoutFollowStateDto } from './dto/follow.dto';

@Injectable()
export class FollowsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  // ---------- Scout -> player / academy (1.2 Scout permissions) ----------

  async follow(followerId: string, dto: CreateFollowDto) {
    await this.assertTargetExists(dto.targetType, dto.targetId);

    return this.prisma.follow.upsert({
      where: {
        followerId_targetType_targetId: {
          followerId,
          targetType: dto.targetType,
          targetId: dto.targetId,
        },
      },
      update: {},
      create: { followerId, targetType: dto.targetType, targetId: dto.targetId },
    });
  }

  /**
   * Idempotent by domain definition - unfollowing something you don't follow is
   * not an error from the caller's perspective (same rationale as
   * `MediaService.unlike`).
   */
  async unfollow(followerId: string, dto: CreateFollowDto) {
    await this.prisma.follow
      .delete({
        where: {
          followerId_targetType_targetId: {
            followerId,
            targetType: dto.targetType,
            targetId: dto.targetId,
          },
        },
      })
      .catch(() => undefined);
    return { unfollowed: true };
  }

  async listFollowing(followerId: string, dto: ListFollowsDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const where = { followerId, ...(dto.targetType ? { targetType: dto.targetType } : {}) };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.follow.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.follow.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async countFollowers(targetType: FollowTargetType, targetId: string) {
    const followers = await this.prisma.follow.count({ where: { targetType, targetId } });
    return { targetType, targetId, followers };
  }

  // ---------- Academy -> scout trust (1.5.2) ----------

  /**
   * Follow or mute a scout on behalf of an academy. The resulting state scales
   * that scout's weight in this academy's recommendation ranking only - it never
   * touches the scout's global reputation (README 1.5.2, "Hard boundary").
   */
  async setScoutFollowState(userId: string, academyId: string, dto: SetScoutFollowStateDto) {
    await this.assertAcademyManager(userId, academyId);

    const scout = await this.prisma.user.findUnique({ where: { id: dto.scoutId } });
    if (!scout) throw new BadRequestException('Scout not found');

    return this.prisma.academyScoutFollow.upsert({
      where: { academyId_scoutId: { academyId, scoutId: dto.scoutId } },
      update: { state: dto.state },
      create: { academyId, scoutId: dto.scoutId, state: dto.state },
    });
  }

  async clearScoutFollowState(userId: string, academyId: string, scoutId: string) {
    await this.assertAcademyManager(userId, academyId);
    await this.prisma.academyScoutFollow
      .delete({ where: { academyId_scoutId: { academyId, scoutId } } })
      .catch(() => undefined);
    return { cleared: true };
  }

  /**
   * The academy's own scout network. Includes MUTED rows - it is their list to
   * manage.
   *
   * Joins the scout in the same query. Returning bare `scoutId`s left the screen
   * printing eight characters of a UUID at a manager who is trying to recognise
   * people — and the only way to render a name from that is a request per row.
   */
  async listScoutNetwork(userId: string, academyId: string) {
    await this.assertAcademyManager(userId, academyId);
    const rows = await this.prisma.academyScoutFollow.findMany({
      where: { academyId },
      orderBy: { createdAt: 'desc' },
      include: {
        scout: { select: { id: true, firstName: true, lastName: true, avatarKey: true } },
      },
    });
    return rows.map((row) => ({ ...row, scout: this.storage.withAvatarUrl(row.scout) }));
  }

  /**
   * Academies that follow this scout - the reward loop in README 1.5.2.
   * MUTED rows are excluded on purpose: a mute is private to the academy and is
   * never surfaced to the scout, who would be unable to appeal or learn from it.
   */
  async listAcademiesFollowingScout(scoutId: string) {
    return this.prisma.academyScoutFollow.findMany({
      where: { scoutId, state: AcademyScoutFollowState.FOLLOWING },
      select: { academyId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async assertTargetExists(targetType: FollowTargetType, targetId: string) {
    const exists =
      targetType === FollowTargetType.PLAYER
        ? await this.prisma.playerProfile.findUnique({ where: { id: targetId } })
        : await this.prisma.academyProfile.findUnique({ where: { id: targetId } });

    if (!exists) throw new BadRequestException(`${targetType} not found`);
    return exists;
  }

  private async assertAcademyManager(userId: string, academyId: string) {
    const membership = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId, userId } },
    });
    if (!membership || membership.role !== 'MANAGER') {
      throw new ForbiddenException('Only the academy manager can manage the scout network');
    }
    return membership;
  }
}
