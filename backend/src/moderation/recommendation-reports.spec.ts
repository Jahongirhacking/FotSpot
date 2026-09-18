import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { AuditAction } from '../audit/audit.actions';

/**
 * Reporting a recommendation's text, and what a moderator may do with it.
 *
 * The recommendation row is never written by any of this: a report is a
 * separate record, "skip" closes the report and nothing else, and "restrict"
 * marks the *scout*, which is what every public read filters on.
 */

const RECOMMENDATION_ID = 'rec-1';
const SCOUT_ID = 'scout-1';
const REPORTER_ID = 'reader-1';
const ADMIN_ID = 'admin-1';

function build(overrides: { openReport?: boolean; alreadyRestricted?: boolean } = {}) {
  const prisma = {
    recommendation: {
      findUnique: jest.fn(async (): Promise<unknown> => ({
        scoutId: SCOUT_ID,
        scout: { restrictedAt: overrides.alreadyRestricted ? new Date('2026-01-01') : null },
      })),
      update: jest.fn(),
    },
    report: {
      findFirst: jest.fn(async (): Promise<unknown> =>
        overrides.openReport ? { id: 'report-0' } : null,
      ),
      findUnique: jest.fn(async (): Promise<unknown> => ({
        id: 'report-1',
        targetRecommendationId: RECOMMENDATION_ID,
        targetMediaId: null,
      })),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'report-1',
        ...data,
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'report-1',
        ...data,
      })),
    },
    user: { update: jest.fn(async (): Promise<unknown> => ({})) },
  };
  const audit = { record: jest.fn(async () => undefined) };

  const service = Object.create(ModerationService.prototype) as ModerationService;
  Object.assign(service, { prisma, audit });
  return { service, prisma, audit };
}

describe('fileReport on a recommendation', () => {
  it('stores the report against the recommendation and leaves the recommendation alone', async () => {
    const { service, prisma } = build();

    const report = await service.fileReport(REPORTER_ID, {
      type: 'RECOMMENDATION',
      reason: 'Insulting',
      targetRecommendationId: RECOMMENDATION_ID,
    });

    expect(report).toMatchObject({
      reporterId: REPORTER_ID,
      type: 'RECOMMENDATION',
      targetRecommendationId: RECOMMENDATION_ID,
    });
    expect(prisma.recommendation.update).not.toHaveBeenCalled();
  });

  it('refuses a second open report from the same reader', async () => {
    const { service, prisma } = build({ openReport: true });

    await expect(
      service.fileReport(REPORTER_ID, {
        type: 'RECOMMENDATION',
        reason: 'Again',
        targetRecommendationId: RECOMMENDATION_ID,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.report.create).not.toHaveBeenCalled();
    expect(prisma.report.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reporterId: REPORTER_ID, targetRecommendationId: RECOMMENDATION_ID, status: 'PENDING' },
      }),
    );
  });

  it('refuses a scout reporting their own text', async () => {
    const { service } = build();

    await expect(
      service.fileReport(SCOUT_ID, {
        type: 'RECOMMENDATION',
        reason: 'Mine',
        targetRecommendationId: RECOMMENDATION_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s on a recommendation that does not exist', async () => {
    const { service, prisma } = build();
    prisma.recommendation.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.fileReport(REPORTER_ID, {
        type: 'RECOMMENDATION',
        reason: 'x',
        targetRecommendationId: 'missing',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('resolving a recommendation report', () => {
  it('skip: closes the report, touches neither scout nor recommendation', async () => {
    const { service, prisma, audit } = build();

    await service.resolve(ADMIN_ID, 'report-1', { status: 'DISMISSED' });

    expect(prisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DISMISSED', resolvedByUserId: ADMIN_ID }),
      }),
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.recommendation.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(ADMIN_ID, AuditAction.REPORT_RESOLVED, {
      reportId: 'report-1',
      status: 'DISMISSED',
    });
  });

  it('restrict: marks the scout restricted with the note as the reason, and audits it', async () => {
    const { service, prisma, audit } = build();

    await service.resolve(ADMIN_ID, 'report-1', {
      status: 'RESOLVED',
      resolutionNote: 'Abusive wording',
      restrictScout: true,
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: SCOUT_ID },
      data: { restrictedAt: expect.any(Date), restrictionReason: 'Abusive wording' },
    });
    expect(prisma.recommendation.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(ADMIN_ID, AuditAction.USER_RESTRICTED, {
      userId: SCOUT_ID,
      reportId: 'report-1',
      recommendationId: RECOMMENDATION_ID,
    });
    expect(prisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RESOLVED' }) }),
    );
  });

  it('restrict on an already restricted scout resolves the report without a second restriction', async () => {
    const { service, prisma } = build({ alreadyRestricted: true });

    await service.resolve(ADMIN_ID, 'report-1', { status: 'RESOLVED', restrictScout: true });

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.report.update).toHaveBeenCalled();
  });

  it('restrict is refused on a report that is not about a recommendation', async () => {
    const { service, prisma } = build();
    prisma.report.findUnique.mockResolvedValueOnce({
      id: 'report-2',
      targetRecommendationId: null,
      targetMediaId: null,
    });

    await expect(
      service.resolve(ADMIN_ID, 'report-2', { status: 'RESOLVED', restrictScout: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
