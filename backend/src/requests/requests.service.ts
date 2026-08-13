import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupportRequestStatus, SupportRequestType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.actions';
import { pageOf, toSkipTake } from '../common/dto/pagination.dto';
import {
  CreateSupportRequestDto,
  ListSupportRequestsDto,
  UpdateSupportRequestDto,
} from './dto/request.dto';

/** A request nobody has closed yet. Both count as work in the queue. */
const OPEN: SupportRequestStatus[] = ['NEW', 'IN_PROGRESS'];

/**
 * Requests from users to the people who run the platform.
 *
 * ## Why deleting an account is a request rather than a button
 *
 * The privacy policy says an account can be removed, and this is how. A
 * self-service delete would be irreversible, would be exactly what a stolen
 * session would press, and would answer the wrong question surprisingly often —
 * somebody who says "delete my account" frequently means "take that clip down"
 * or "stop showing me in search", which a conversation finds and a button never
 * asks about. On a platform whose users are children, the slower path is the
 * right one.
 *
 * The cost is that somebody has to read these, which is what the badge on the
 * admin navbar is for.
 */
@Injectable()
export class RequestsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * Files a request.
   *
   * One open request of a type at a time. A user who presses "delete my account"
   * three times has not asked three times — they have asked once and been given
   * no feedback, and a queue with three identical rows costs an admin the time to
   * work out that it is one person. The existing request is returned instead, so
   * the client can show them it is already in hand.
   */
  async create(userId: string, dto: CreateSupportRequestDto) {
    const open = await this.prisma.supportRequest.findFirst({
      where: { userId, type: dto.type, status: { in: OPEN } },
      orderBy: { createdAt: 'desc' },
    });
    if (open) return { ...open, alreadyOpen: true };

    const created = await this.prisma.supportRequest.create({
      data: { userId, type: dto.type, message: dto.message?.trim() || null },
    });

    // Audited because a deletion request is the start of a paper trail that has
    // to survive the account it is about.
    await this.audit.record(userId, AuditAction.SUPPORT_REQUEST_CREATED, {
      requestId: created.id,
      type: created.type,
    });

    return { ...created, alreadyOpen: false };
  }

  /** What this user has asked for, so the app can say "already in hand". */
  async listMine(userId: string) {
    return this.prisma.supportRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  /**
   * The admin queue.
   *
   * Carries the contact details deliberately: the whole workflow is "get in touch
   * with this person, then act", and an admin who has to open a second screen to
   * find an email address is an admin who will not.
   */
  async list(dto: ListSupportRequestsDto) {
    const { skip, take, page, pageSize } = toSkipTake(dto);
    const where: Prisma.SupportRequestWhereInput = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.type ? { type: dto.type } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.supportRequest.findMany({
        where,
        // Oldest open request first: a queue nobody works from the bottom of.
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              email: true,
              phone: true,
              isActive: true,
            },
          },
          handledBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.supportRequest.count({ where }),
    ]);

    return pageOf(rows, total, { page, pageSize });
  }

  /**
   * How many are waiting — the number on the navbar.
   *
   * Counts NEW only, not everything open: an admin who has picked a request up
   * knows about it, and a badge that keeps counting what you are already working
   * on is a badge you stop reading.
   */
  async newCount() {
    return { count: await this.prisma.supportRequest.count({ where: { status: 'NEW' } }) };
  }

  /**
   * An admin picking a request up or closing it.
   *
   * The note is required to close one. "Resolved" with no record of what was done
   * is the state that makes a later complaint unanswerable — and for a deletion
   * request, unanswerable is the wrong outcome.
   */
  async update(adminId: string, id: string, dto: UpdateSupportRequestDto) {
    const existing = await this.prisma.supportRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Request not found');

    const closing = dto.status === 'RESOLVED' || dto.status === 'DECLINED';
    if (closing && !dto.handledNote?.trim()) {
      throw new BadRequestException('Say what was done before closing this request');
    }

    const updated = await this.prisma.supportRequest.update({
      where: { id },
      data: {
        status: dto.status,
        handledNote: dto.handledNote?.trim() || existing.handledNote,
        handledById: adminId,
        handledAt: new Date(),
      },
    });

    await this.audit.record(adminId, AuditAction.SUPPORT_REQUEST_HANDLED, {
      requestId: id,
      type: existing.type,
      status: dto.status,
      subjectUserId: existing.userId,
    });

    return updated;
  }

  /** Convenience for the client: the types it may offer. */
  types(): SupportRequestType[] {
    return ['DELETE_ACCOUNT', 'FEEDBACK', 'BUG', 'OTHER'];
  }
}
