// src/modules/coaches/coaches.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export class CreateCoachProfileDto {
  licenseNumber?: string;
  specialization?: string;
  experienceYears?: number;
  bio?: string;
}

export class CreateAssessmentDto {
  playerId: string;
  speed: number; // 1-10
  passing: number;
  vision: number;
  dribbling: number;
  finishing: number;
  physical: number;
  leadership: number;
  discipline: number;
  notes?: string;
  isPublic?: boolean;
}

@Injectable()
export class CoachesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Profile ─────────────────────────────────────────────────────

  async createProfile(userId: string, dto: CreateCoachProfileDto) {
    const existing = await this.prisma.coachProfile.findUnique({
      where: { userId },
    });
    if (existing) throw new ConflictException("Coach profile already exists");

    // Coach role assignment
    const coachRole = await this.prisma.role.findUnique({
      where: { name: "COACH" },
    });
    if (coachRole) {
      await this.prisma.userRole
        .create({ data: { userId, roleId: coachRole.id } })
        .catch(() => {});
    }

    return this.prisma.coachProfile.create({
      data: { userId, ...dto },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
  }

  async findByUserId(userId: string) {
    const coach = await this.prisma.coachProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { firstName: true, lastName: true, avatar: true } },
      },
    });
    if (!coach) throw new NotFoundException("Coach profile not found");
    return coach;
  }

  // ─── Assessment ──────────────────────────────────────────────────
  // Only VERIFIED coaches can create assessments

  async createAssessment(userId: string, dto: CreateAssessmentDto) {
    // 1. Get coach profile and verify status
    const coach = await this.prisma.coachProfile.findUnique({
      where: { userId },
    });
    if (!coach) throw new NotFoundException("Coach profile not found");
    if (coach.status !== "VERIFIED") {
      throw new ForbiddenException(
        "Only verified coaches can create assessments",
      );
    }

    // 2. Check player exists
    const player = await this.prisma.playerProfile.findUnique({
      where: { id: dto.playerId },
    });
    if (!player) throw new NotFoundException("Player not found");

    // 3. Validate ratings 1-10
    const ratingFields = [
      "speed",
      "passing",
      "vision",
      "dribbling",
      "finishing",
      "physical",
      "leadership",
      "discipline",
    ];
    for (const field of ratingFields) {
      const val = (dto as any)[field];
      if (val < 1 || val > 10) {
        throw new BadRequestException(`${field} must be between 1 and 10`);
      }
    }

    // 4. Compute overall average
    const overall =
      (dto.speed +
        dto.passing +
        dto.vision +
        dto.dribbling +
        dto.finishing +
        dto.physical +
        dto.leadership +
        dto.discipline) /
      8;

    return this.prisma.coachAssessment.create({
      data: {
        coachId: coach.id,
        playerId: dto.playerId,
        speed: dto.speed,
        passing: dto.passing,
        vision: dto.vision,
        dribbling: dto.dribbling,
        finishing: dto.finishing,
        physical: dto.physical,
        leadership: dto.leadership,
        discipline: dto.discipline,
        overall,
        notes: dto.notes,
        isPublic: dto.isPublic ?? false,
      },
    });
  }

  async getPlayerAssessments(playerId: string) {
    return this.prisma.coachAssessment.findMany({
      where: { playerId, isPublic: true },
      include: {
        coach: {
          include: {
            user: { select: { firstName: true, lastName: true, avatar: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getMyAssessments(userId: string) {
    const coach = await this.prisma.coachProfile.findUnique({
      where: { userId },
    });
    if (!coach) throw new NotFoundException("Coach profile not found");

    return this.prisma.coachAssessment.findMany({
      where: { coachId: coach.id },
      include: {
        player: {
          include: {
            user: { select: { firstName: true, lastName: true, avatar: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
