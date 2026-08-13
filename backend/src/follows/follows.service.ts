import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AcademyScoutFollowState, Follow, FollowTargetType } from '@prisma/client';
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

  /**
   * Refuses a follow that points back at the caller.
   *
   * A self-follow is not harmful so much as meaningless — it inflates a follower
   * count with its owner and puts your own card in your own feed. `PLAYER`
   * targets a profile rather than an account, so the check resolves the profile's
   * owner rather than comparing ids that are not the same kind of thing.
   */
  private async assertNotSelf(followerId: string, dto: CreateFollowDto) {
    if (dto.targetType !== 'PLAYER') return;
    const player = await this.prisma.playerProfile.findUnique({
      where: { id: dto.targetId },
      select: { userId: true },
    });
    if (player?.userId === followerId) {
      throw new ForbiddenException('You cannot follow your own profile');
    }
  }

  async follow(followerId: string, dto: CreateFollowDto) {
    await this.assertTargetExists(dto.targetType, dto.targetId);
    await this.assertNotSelf(followerId, dto);

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

    return { items: await this.describeTargets(items), total, page, pageSize };
  }

  /**
   * Puts a name and a face on each row.
   *
   * A `Follow` stores only a type and an id, so a list built from the rows alone
   * can show nothing but a uuid — which is exactly what the network screen was
   * doing, printing the first eight characters of one where a name belongs.
   *
   * Resolved in two queries rather than one per row: a page of twenty follows
   * would otherwise be twenty round trips for two lookups' worth of data.
   *
   * A row whose target has since been deleted keeps its place with a null name.
   * Dropping it would make the list quietly shorter than the count beside it.
   */
  private async describeTargets(rows: Follow[]) {
    const playerIds = rows.filter((r) => r.targetType === 'PLAYER').map((r) => r.targetId);
    const academyIds = rows.filter((r) => r.targetType === 'ACADEMY').map((r) => r.targetId);

    const [players, academies] = await Promise.all([
      playerIds.length
        ? this.prisma.playerProfile.findMany({
            where: { id: { in: playerIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              user: { select: { username: true, avatarKey: true } },
            },
          })
        : [],
      academyIds.length
        ? this.prisma.academyProfile.findMany({
            where: { id: { in: academyIds } },
            select: { id: true, name: true, logoKey: true },
          })
        : [],
    ]);

    const playerById = new Map(players.map((p) => [p.id, p] as const));
    const academyById = new Map(academies.map((a) => [a.id, a] as const));

    return rows.map((row) => {
      const player = playerById.get(row.targetId);
      const academy = academyById.get(row.targetId);
      return {
        ...row,
        name: player
          ? [player.firstName, player.lastName].filter(Boolean).join(' ')
          : (academy?.name ?? null),
        username: player?.user?.username ?? null,
        avatarUrl: this.storage.publicUrlOrNull(player?.user?.avatarKey ?? academy?.logoKey),
      };
    });
  }

  /**
   * The people and academies following *you*.
   *
   * Two different relations, deliberately in one list, because they are one
   * question to the person asking — and because `UsersService.summary` already
   * adds them together for the number this list sits under. A list that did not
   * match its own counter would be the more confusing outcome.
   *
   * - Somebody following your **player card** (`Follow` → your PlayerProfile).
   * - An academy following you as a **scout** (`AcademyScoutFollow`), which is
   *   the academy trusting your recommendations (§1.5.2).
   *
   * Muted scout rows are excluded: an academy that muted you is not following
   * you, and counting it as a follower would flatter the number.
   */
  async listFollowers(userId: string) {
    const player = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    const [cardFollowers, academyFollowers] = await Promise.all([
      player
        ? this.prisma.follow.findMany({
            where: { targetType: 'PLAYER', targetId: player.id },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              createdAt: true,
              follower: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  username: true,
                  avatarKey: true,
                  // The card, if they have one. A follower is an *account*, and
                  // /players/:id wants a profile id — a different thing — so the
                  // client cannot build a link without this and would otherwise
                  // have to guess at one that 404s.
                  playerProfile: { select: { id: true } },
                },
              },
            },
          })
        : [],
      this.prisma.academyScoutFollow.findMany({
        where: { scoutId: userId, state: 'FOLLOWING' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          academy: { select: { id: true, name: true, logoKey: true } },
        },
      }),
    ]);

    const items = [
      ...cardFollowers.map((row) => ({
        id: row.id,
        kind: 'USER' as const,
        createdAt: row.createdAt,
        userId: row.follower?.id ?? null,
        /** Where their public profile lives, or null if they never built a card. */
        profileId: row.follower?.playerProfile?.id ?? null,
        name: [row.follower?.firstName, row.follower?.lastName].filter(Boolean).join(' ') || null,
        username: row.follower?.username ?? null,
        avatarUrl: this.storage.publicUrlOrNull(row.follower?.avatarKey),
      })),
      ...academyFollowers.map((row) => ({
        id: row.id,
        kind: 'ACADEMY' as const,
        createdAt: row.createdAt,
        academyId: row.academy?.id ?? null,
        name: row.academy?.name ?? null,
        username: null,
        avatarUrl: this.storage.publicUrlOrNull(row.academy?.logoKey),
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return { items, total: items.length };
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
