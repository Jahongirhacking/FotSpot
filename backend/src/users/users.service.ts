import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
  ) {}

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const access = await this.rbac.getEffectiveAccess(userId);
    return { ...user, ...access };
  }

  /**
   * Everything the profile screen shows, in one round trip: identity, roles, and
   * the per-role counters that make a profile worth opening.
   *
   * Assembled here rather than by the client calling five endpoints — most of these
   * are cheap counts, and a profile page that fires five requests on an entry-level
   * phone over mobile data (README §14) is the wrong shape.
   */
  async findMeWithStats(userId: string) {
    const me = await this.findMe(userId);

    const [player, coach, scoutStats, academyMemberships, followingCount, followerAcademies] =
      await Promise.all([
        this.prisma.playerProfile.findUnique({
          where: { userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            primaryPosition: true,
            playingStyle: true,
            region: true,
            matches: true,
            goals: true,
            assists: true,
            _count: { select: { media: true, trialApplications: true, recommendations: true } },
          },
        }),
        this.prisma.coachProfile.findUnique({
          where: { userId },
          select: { id: true, status: true, _count: { select: { assessments: true } } },
        }),
        this.prisma.scoutStats.findUnique({ where: { userId } }),
        this.prisma.academyMember.findMany({
          where: { userId },
          select: { academyId: true, role: true, academy: { select: { name: true, status: true } } },
        }),
        this.prisma.follow.count({ where: { followerId: userId } }),
        this.prisma.academyScoutFollow.count({
          where: { scoutId: userId, state: 'FOLLOWING' },
        }),
      ]);

    return {
      ...me,
      stats: {
        player: player
          ? {
              profileId: player.id,
              birthDate: player.birthDate,
              primaryPosition: player.primaryPosition,
              playingStyle: player.playingStyle,
              region: player.region,
              matches: player.matches,
              goals: player.goals,
              assists: player.assists,
              mediaCount: player._count.media,
              trialApplications: player._count.trialApplications,
              recommendationsReceived: player._count.recommendations,
            }
          : null,
        coach: coach
          ? { profileId: coach.id, status: coach.status, assessments: coach._count.assessments }
          : null,
        scout: scoutStats
          ? {
              totalRecommendations: scoutStats.totalRecommendations,
              acceptedRecommendations: scoutStats.acceptedRecommendations,
              successRate: scoutStats.successRate,
              level: scoutStats.level,
              weight: scoutStats.weight,
              followerAcademies,
            }
          : null,
        academies: academyMemberships.map((membership) => ({
          academyId: membership.academyId,
          name: membership.academy.name,
          status: membership.academy.status,
          role: membership.role,
        })),
        following: followingCount,
      },
    };
  }

  async findPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
