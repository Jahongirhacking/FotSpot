import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateTrialDto,
  UpdateTrialApplicationStatusDto,
  UpdateTrialDto,
} from './dto/trial.dto';

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

  /**
   * Everything this academy has run, archived included.
   *
   * The manager's own list is the one place an archived trial must still appear:
   * it is where they go to reopen one closed by mistake, and where the
   * applicants of a finished trial still live.
   */
  async listForAcademy(academyId: string) {
    return this.prisma.trial.findMany({ where: { academyId }, orderBy: { date: 'asc' } });
  }

  async listUpcoming() {
    return this.prisma.trial.findMany({
      where: { date: { gte: new Date() }, status: 'OPEN' },
      orderBy: { date: 'asc' },
    });
  }

  /**
   * Change a published trial, or close it.
   *
   * There is no delete. Every application attached to a trial is a decision
   * somebody made about a child, and a row that vanishes takes that record with
   * it — so a trial that will not happen is ARCHIVED, which stops applications
   * and hides it from the public list while the academy keeps the history.
   */
  async update(userId: string, trialId: string, dto: UpdateTrialDto) {
    const trial = await this.getById(trialId);
    await this.assertAcademyManager(userId, trial.academyId);

    const ageRangeMin = dto.ageRangeMin ?? trial.ageRangeMin;
    const ageRangeMax = dto.ageRangeMax ?? trial.ageRangeMax;
    if (ageRangeMin > ageRangeMax) {
      throw new BadRequestException('The minimum age cannot be above the maximum');
    }

    return this.prisma.trial.update({
      where: { id: trialId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.location !== undefined ? { location: dto.location.trim() } : {}),
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
        ...(dto.ageRangeMin !== undefined ? { ageRangeMin: dto.ageRangeMin } : {}),
        ...(dto.ageRangeMax !== undefined ? { ageRangeMax: dto.ageRangeMax } : {}),
        ...(dto.positions !== undefined ? { positions: dto.positions } : {}),
        ...(dto.requirements !== undefined
          ? { requirements: dto.requirements.trim() || null }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
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
    if (trial.status === 'ARCHIVED') {
      throw new BadRequestException('This trial is closed to new applications');
    }

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
