import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto, ResolveReportDto } from './dto/moderation.dto';

@Injectable()
export class ModerationService {
  constructor(private prisma: PrismaService) {}

  async fileReport(reporterId: string, dto: CreateReportDto) {
    const hasTarget =
      dto.targetUserId || dto.targetMediaId || dto.targetAcademyId || dto.targetCoachId;
    if (!hasTarget) throw new BadRequestException('A report must reference a target');

    return this.prisma.report.create({
      data: {
        reporterId,
        type: dto.type,
        reason: dto.reason,
        targetUserId: dto.targetUserId,
        targetMediaId: dto.targetMediaId,
        targetAcademyId: dto.targetAcademyId,
        targetCoachId: dto.targetCoachId,
      },
    });
  }

  /** Admin-only. */
  async listPending() {
    return this.prisma.report.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Admin-only: resolves a report, optionally taking down reported media. */
  async resolve(reportId: string, dto: ResolveReportDto) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    if (dto.removeMedia && report.targetMediaId) {
      await this.prisma.media.update({
        where: { id: report.targetMediaId },
        data: { status: 'REMOVED' },
      });
    }

    return this.prisma.report.update({
      where: { id: reportId },
      data: { status: dto.status, resolutionNote: dto.resolutionNote },
    });
  }

  /** Admin-only: flag media without a formal report (e.g. proactive moderation). */
  async flagMedia(mediaId: string) {
    return this.prisma.media.update({ where: { id: mediaId }, data: { status: 'FLAGGED' } });
  }
}
