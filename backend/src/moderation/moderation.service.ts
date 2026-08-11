import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.actions';
import { CreateReportDto, ResolveReportDto } from './dto/moderation.dto';
import { PaginationDto, pageOf, toSkipTake } from '../common/dto/pagination.dto';

@Injectable()
export class ModerationService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

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

  /**
   * Admin-only, oldest first — a queue, so the front of it is what matters.
   *
   * Paginated because the length of this list is set by *reporters*, not by the
   * platform: a single motivated account can file thousands, and the screen that
   * has to be usable during exactly that incident is this one.
   */
  async listPending(dto: PaginationDto = {}) {
    const { skip, take, page, pageSize } = toSkipTake(dto);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        skip,
        take,
      }),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
    ]);

    return pageOf(items, total, { page, pageSize });
  }

  /** Admin-only: resolves a report, optionally taking down reported media. */
  async resolve(actorId: string, reportId: string, dto: ResolveReportDto) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    if (dto.removeMedia && report.targetMediaId) {
      await this.prisma.media.update({
        where: { id: report.targetMediaId },
        data: { status: 'REMOVED' },
      });
      await this.audit.record(actorId, AuditAction.MEDIA_TAKEN_DOWN, {
        mediaId: report.targetMediaId,
        reportId,
      });
    }

    const resolved = await this.prisma.report.update({
      where: { id: reportId },
      data: { status: dto.status, resolutionNote: dto.resolutionNote },
    });

    await this.audit.record(actorId, AuditAction.REPORT_RESOLVED, {
      reportId,
      status: dto.status,
    });
    return resolved;
  }

  /** Admin-only: flag media without a formal report (e.g. proactive moderation). */
  async flagMedia(actorId: string, mediaId: string) {
    const media = await this.prisma.media.update({
      where: { id: mediaId },
      data: { status: 'FLAGGED' },
    });
    await this.audit.record(actorId, AuditAction.MEDIA_TAKEN_DOWN, { mediaId, flaggedOnly: true });
    return media;
  }
}
