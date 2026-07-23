import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTrialDto, UpdateTrialApplicationStatusDto } from './dto/trial.dto';

@Injectable()
export class TrialsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(userId: string, academyId: string, dto: CreateTrialDto) {
    await this.assertAcademyManager(userId, academyId);
    return this.prisma.trial.create({
      data: { academyId, ...dto, date: new Date(dto.date) },
    });
  }

  async listForAcademy(academyId: string) {
    return this.prisma.trial.findMany({ where: { academyId }, orderBy: { date: 'asc' } });
  }

  async listUpcoming() {
    return this.prisma.trial.findMany({
      where: { date: { gte: new Date() } },
      orderBy: { date: 'asc' },
    });
  }

  async getById(trialId: string) {
    const trial = await this.prisma.trial.findUnique({ where: { id: trialId } });
    if (!trial) throw new NotFoundException('Trial not found');
    return trial;
  }

  /** Player applies to a trial (1.11: initial status = Applied). */
  async apply(userId: string, trialId: string) {
    const player = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!player) throw new ForbiddenException('Only players can apply to trials');

    const trial = await this.getById(trialId);
    const age = this.ageFromBirthDate(player.birthDate, trial.date);
    if (age < trial.ageRangeMin || age > trial.ageRangeMax) {
      throw new BadRequestException(
        `Player age (${age}) is outside the trial's age range (${trial.ageRangeMin}-${trial.ageRangeMax})`,
      );
    }

    return this.prisma.trialApplication.upsert({
      where: { trialId_playerId: { trialId, playerId: player.id } },
      update: {},
      create: { trialId, playerId: player.id },
    });
  }

  async listMyApplications(userId: string) {
    const player = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!player) throw new ForbiddenException('Only players have trial applications');
    return this.prisma.trialApplication.findMany({
      where: { playerId: player.id },
      include: { trial: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listApplicationsForTrial(userId: string, trialId: string) {
    const trial = await this.getById(trialId);
    await this.assertAcademyManager(userId, trial.academyId);
    return this.prisma.trialApplication.findMany({
      where: { trialId },
      include: { player: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Academy Manager transitions: Applied -> Shortlisted -> Invited -> Rejected/Accepted (1.11). */
  async updateApplicationStatus(
    userId: string,
    applicationId: string,
    dto: UpdateTrialApplicationStatusDto,
  ) {
    const application = await this.prisma.trialApplication.findUnique({
      where: { id: applicationId },
      include: { trial: true, player: true },
    });
    if (!application) throw new NotFoundException('Trial application not found');

    await this.assertAcademyManager(userId, application.trial.academyId);

    const updated = await this.prisma.trialApplication.update({
      where: { id: applicationId },
      data: { status: dto.status },
    });

    const event = dto.status === 'INVITED' ? 'TRIAL_INVITATION' : 'TRIAL_RESULT';
    await this.notifications.notify(application.player.userId, event, {
      applicationId,
      trialId: application.trialId,
      status: dto.status,
    });

    return updated;
  }

  private ageFromBirthDate(birthDate: Date, atDate: Date): number {
    let age = atDate.getFullYear() - birthDate.getFullYear();
    const hasHadBirthdayThisYear =
      atDate.getMonth() > birthDate.getMonth() ||
      (atDate.getMonth() === birthDate.getMonth() && atDate.getDate() >= birthDate.getDate());
    if (!hasHadBirthdayThisYear) age -= 1;
    return age;
  }

  private async assertAcademyManager(userId: string, academyId: string) {
    const membership = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId, userId } },
    });
    if (!membership || membership.role !== 'MANAGER') {
      throw new ForbiddenException('Only the academy manager can perform this action');
    }
    return membership;
  }
}
