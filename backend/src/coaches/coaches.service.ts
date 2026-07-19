import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { CreateAssessmentDto, CreateCoachProfileDto } from './dto/coach.dto';

@Injectable()
export class CoachesService {
  constructor(private prisma: PrismaService, private rbac: RbacService) {}

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
  async verify(coachProfileId: string, approve: boolean) {
    const profile = await this.prisma.coachProfile.findUnique({ where: { id: coachProfileId } });
    if (!profile) throw new NotFoundException('Coach profile not found');

    const updated = await this.prisma.coachProfile.update({
      where: { id: coachProfileId },
      data: { status: approve ? 'VERIFIED' : 'REJECTED' },
    });

    if (approve) {
      await this.rbac.assignRole(profile.userId, 'coach');
    }
    return updated;
  }

  async createAssessment(userId: string, dto: CreateAssessmentDto) {
    const coachProfile = await this.prisma.coachProfile.findUnique({ where: { userId } });
    if (!coachProfile) throw new NotFoundException('Coach profile not found');
    if (coachProfile.status !== 'VERIFIED') {
      throw new ForbiddenException('Only verified coaches can submit assessments');
    }

    const player = await this.prisma.playerProfile.findUnique({ where: { id: dto.playerId } });
    if (!player) throw new BadRequestException('Player not found');

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

  async listAssessmentsForPlayer(playerId: string) {
    return this.prisma.coachAssessment.findMany({
      where: { playerId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
