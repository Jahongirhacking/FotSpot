import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, pageOf, toSkipTake } from '../common/dto/pagination.dto';
import { RbacService } from '../rbac/rbac.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.actions';
import { GroupsService } from '../academies/groups.service';
import { CreateAssessmentDto, CreateCoachProfileDto } from './dto/coach.dto';

@Injectable()
export class CoachesService {
  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
    private audit: AuditService,
    private groups: GroupsService,
  ) {}

  /**
   * An academy takes on a coach — the academy vouches, so the profile is created
   * VERIFIED and the `coach` role is granted immediately.
   *
   * This replaces admin verification of coaches. Academies are themselves
   * onboarded by the platform team (README §1.10), so the trust chain is already
   * established one level up: an admin vetted the academy, and the academy vets
   * its own staff. Routing every coach through a second admin queue would add a
   * reviewer with strictly less knowledge of the person than the academy hiring
   * them.
   */
  async createForAcademy(
    actorId: string,
    academyId: string,
    dto: { userId: string; bio?: string },
  ) {
    const membership = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId, userId: actorId } },
    });
    if (!membership || membership.role !== 'MANAGER') {
      throw new ForbiddenException('Only the academy manager can add a coach');
    }

    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new BadRequestException('That account does not exist');

    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.coachProfile.upsert({
        where: { userId: dto.userId },
        update: { status: 'VERIFIED', ...(dto.bio ? { bio: dto.bio } : {}) },
        create: { userId: dto.userId, bio: dto.bio, status: 'VERIFIED' },
      });

      await tx.academyMember.upsert({
        where: { academyId_userId: { academyId, userId: dto.userId } },
        update: { role: 'COACH', coachId: profile.id },
        create: { academyId, userId: dto.userId, role: 'COACH', coachId: profile.id },
      });

      await this.rbac.assignRole(dto.userId, 'coach', tx);
      return profile;
    });
  }

  async createProfile(userId: string, dto: CreateCoachProfileDto) {
    const existing = await this.prisma.coachProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Coach profile already exists');

    // Coach is a "Verified role" (1.2) - profile starts PENDING; role grant
    // itself happens once Admin verifies (see CoachesService.verify()).
    return this.prisma.coachProfile.create({ data: { userId, bio: dto.bio } });
  }

  async getOwnProfile(userId: string) {
    const profile = await this.prisma.coachProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Coach profile not found');
    return profile;
  }

  async getPublicProfile(coachProfileId: string) {
    const profile = await this.prisma.coachProfile.findUnique({ where: { id: coachProfileId } });
    if (!profile) throw new NotFoundException('Coach not found');
    return profile;
  }

  /** Admin-only: approves/rejects a pending coach (1.2 status flow). */
  async verify(coachProfileId: string, approve: boolean, actorId: string | null = null) {
    const profile = await this.prisma.coachProfile.findUnique({ where: { id: coachProfileId } });
    if (!profile) throw new NotFoundException('Coach profile not found');

    const updated = await this.prisma.coachProfile.update({
      where: { id: coachProfileId },
      data: { status: approve ? 'VERIFIED' : 'REJECTED' },
    });

    if (approve) {
      await this.rbac.assignRole(profile.userId, 'coach');
    }

    await this.audit.record(actorId, AuditAction.COACH_VERIFIED, { coachProfileId, approve });
    return updated;
  }

  /**
   * A coach records what they think of a player they coach.
   *
   * Two gates, and no others (README §1.9, TRIAL.md Rule 21): the coach profile
   * is VERIFIED, and the coach shares a squad group with the player. The second
   * is the one that makes the number mean anything — it is the difference
   * between somebody who has watched this player train and somebody who has
   * watched a video of them.
   *
   * Deliberately not reachable from the online-review or trial screens. Those
   * ask a coach one question each, and Rule 22 keeps attributes off both.
   */
  async createAssessment(userId: string, dto: CreateAssessmentDto) {
    const coachProfile = await this.prisma.coachProfile.findUnique({ where: { userId } });
    if (!coachProfile) throw new NotFoundException('Coach profile not found');
    if (coachProfile.status !== 'VERIFIED') {
      throw new ForbiddenException('Only verified coaches can submit assessments');
    }

    const player = await this.prisma.playerProfile.findUnique({ where: { id: dto.playerId } });
    if (!player) throw new BadRequestException('Player not found');

    /*
     * A coach cannot assess their own player profile.
     *
     * A coach assessment is the verified half of a card — it is what turns a
     * self-reported number into one somebody stood on a pitch and vouched for.
     * Assessing yourself collapses those into the same claim while still being
     * drawn as verified, which is the one thing the distinction exists to
     * prevent. Enforced here because the endpoint is reachable without the UI.
     */
    if (player.userId === userId) {
      throw new ForbiddenException('You cannot assess your own player profile');
    }

    await this.groups.assertCoachesPlayer(userId, dto.playerId);

    return this.prisma.coachAssessment.create({
      data: {
        coachUserId: userId,
        coachProfileId: coachProfile.id,
        playerId: dto.playerId,
        speed: dto.speed,
        passing: dto.passing,
        vision: dto.vision,
        dribbling: dto.dribbling,
        finishing: dto.finishing,
        physical: dto.physical,
        leadership: dto.leadership,
        discipline: dto.discipline,
        notes: dto.notes,
        mediaUrls: dto.mediaUrls ?? [],
        documentUrls: dto.documentUrls ?? [],
      },
    });
  }

  /**
   * Every assessment written about a player, newest first.
   *
   * Paginated: a player who stays at an academy collects one of these per coach
   * per review cycle for years, and nothing ever deletes them — the history is
   * the point (§1.9). The screen shows the recent ones; the rest are still here.
   */
  async listAssessmentsForPlayer(playerId: string, dto: PaginationDto = {}) {
    const { skip, take, page, pageSize } = toSkipTake(dto);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.coachAssessment.findMany({
        where: { playerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.coachAssessment.count({ where: { playerId } }),
    ]);

    return pageOf(items, total, { page, pageSize });
  }
}
