import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { pageOf, toSkipTake } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertKeyUnder,
  professionalPlayerMediaKey,
  professionalPlayerMediaPrefix,
} from '../storage/storage.keys';
import { StorageService } from '../storage/storage.service';
import {
  ListProfessionalPlayersDto,
  ProfessionalPlayerImageUploadDto,
  SaveProfessionalPlayerDto,
} from './dto/professional-player.dto';

const PLAYER_INCLUDE = {
  academies: {
    select: {
      academy: { select: { id: true, name: true, username: true, logoKey: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.ProfessionalPlayerInclude;

type PlayerRow = Prisma.ProfessionalPlayerGetPayload<{ include: typeof PLAYER_INCLUDE }>;

/**
 * The professionals directory — README §21.
 *
 * Separate from every player query on purpose (see the Prisma model). Admins
 * write the records; an academy's manager chooses which of them the academy
 * claims, and only for the academy they manage. Both halves are checked here,
 * never only by the button that was drawn.
 */
@Injectable()
export class ProfessionalPlayersService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

  async list(dto: ListProfessionalPlayersDto) {
    const { skip, take, page, pageSize } = toSkipTake(dto);
    const where: Prisma.ProfessionalPlayerWhereInput = {
      ...(dto.query ? this.nameWhere(dto.query) : {}),
      ...(dto.academyId ? { academies: { some: { academyId: dto.academyId } } } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.professionalPlayer.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip,
        take,
        include: PLAYER_INCLUDE,
      }),
      this.prisma.professionalPlayer.count({ where }),
    ]);

    return pageOf(
      rows.map((row) => this.present(row)),
      total,
      { page, pageSize },
    );
  }

  async get(id: string) {
    const row = await this.prisma.professionalPlayer.findUnique({
      where: { id },
      include: PLAYER_INCLUDE,
    });
    if (!row) throw new NotFoundException('Professional player not found');
    return this.present(row);
  }

  /** Everyone an academy claims came through it — the academy page's list. */
  async listForAcademy(academyId: string) {
    const rows = await this.prisma.professionalPlayer.findMany({
      where: { academies: { some: { academyId } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: PLAYER_INCLUDE,
    });
    return rows.map((row) => this.present(row));
  }

  async create(actorId: string, dto: SaveProfessionalPlayerDto) {
    const firstName = dto.firstName?.trim();
    const lastName = dto.lastName?.trim();
    if (!firstName || !lastName) throw new BadRequestException('First and last name are required');

    const academyIds = await this.checkedAcademyIds(dto.academyIds ?? []);

    const row = await this.prisma.professionalPlayer.create({
      data: {
        firstName,
        lastName,
        position: dto.position?.trim() || null,
        dominantFoot: dto.dominantFoot ?? null,
        academies: { create: academyIds.map((academyId) => ({ academyId })) },
      },
      include: PLAYER_INCLUDE,
    });
    await this.audit.record(actorId, AuditAction.PRO_PLAYER_CREATED, {
      professionalPlayerId: row.id,
    });
    return this.present(row);
  }

  async update(actorId: string, id: string, dto: SaveProfessionalPlayerDto) {
    const existing = await this.prisma.professionalPlayer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Professional player not found');

    if (dto.avatarKey) assertKeyUnder(dto.avatarKey, professionalPlayerMediaPrefix(id));
    const academyIds = dto.academyIds ? await this.checkedAcademyIds(dto.academyIds) : undefined;

    const data: Prisma.ProfessionalPlayerUpdateInput = {
      ...(dto.firstName !== undefined ? { firstName: this.requiredName(dto.firstName) } : {}),
      ...(dto.lastName !== undefined ? { lastName: this.requiredName(dto.lastName) } : {}),
      ...(dto.avatarKey !== undefined ? { avatarKey: dto.avatarKey || null } : {}),
      ...(dto.position !== undefined ? { position: dto.position.trim() || null } : {}),
      ...(dto.dominantFoot !== undefined ? { dominantFoot: dto.dominantFoot } : {}),
      // The whole set, replaced: the admin sees a list and saves the list.
      ...(academyIds
        ? {
            academies: {
              deleteMany: {},
              create: academyIds.map((academyId) => ({ academyId })),
            },
          }
        : {}),
    };

    const row = await this.prisma.professionalPlayer.update({
      where: { id },
      data,
      include: PLAYER_INCLUDE,
    });
    await this.audit.record(actorId, AuditAction.PRO_PLAYER_UPDATED, { professionalPlayerId: id });
    return this.present(row);
  }

  async remove(actorId: string, id: string) {
    const existing = await this.prisma.professionalPlayer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Professional player not found');
    // The join rows go with it (onDelete: Cascade); the portrait stays in R2
    // like every other orphaned object, which is a storage sweep's job.
    await this.prisma.professionalPlayer.delete({ where: { id } });
    await this.audit.record(actorId, AuditAction.PRO_PLAYER_DELETED, { professionalPlayerId: id });
    return { deleted: true };
  }

  async avatarUploadUrl(id: string, dto: ProfessionalPlayerImageUploadDto) {
    const existing = await this.prisma.professionalPlayer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Professional player not found');
    const storageKey = professionalPlayerMediaKey(id, dto.filename);
    return this.storage.createUploadUrl(storageKey, dto.contentType);
  }

  /**
   * The academy's claim on its alumni — README §21.
   *
   * The manager of that academy, or an admin correcting it (§1.10) — the same
   * two the academy's own update allows. A manager of another academy is not
   * a manager here, whatever else they manage.
   */
  async setForAcademy(
    userId: string,
    academyId: string,
    professionalPlayerIds: string[],
    isAdmin: boolean,
  ) {
    if (!isAdmin) await this.assertManager(userId, academyId);

    const academy = await this.prisma.academyProfile.findUnique({
      where: { id: academyId },
      select: { id: true },
    });
    if (!academy) throw new NotFoundException('Academy not found');

    const ids = [...new Set(professionalPlayerIds)];
    const found = await this.prisma.professionalPlayer.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException('Unknown professional player');

    await this.prisma.$transaction([
      this.prisma.professionalPlayerAcademy.deleteMany({
        where: { academyId, professionalPlayerId: { notIn: ids } },
      }),
      this.prisma.professionalPlayerAcademy.createMany({
        data: ids.map((professionalPlayerId) => ({ academyId, professionalPlayerId })),
        skipDuplicates: true,
      }),
    ]);
    await this.audit.record(userId, AuditAction.ACADEMY_PRO_PLAYERS_SET, {
      academyId,
      count: ids.length,
    });
    return this.listForAcademy(academyId);
  }

  private async assertManager(userId: string, academyId: string) {
    const membership = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId, userId } },
      select: { role: true },
    });
    if (!membership || membership.role !== 'MANAGER') {
      throw new ForbiddenException('Only the academy manager can perform this action');
    }
  }

  private requiredName(value: string): string {
    const name = value.trim();
    if (!name) throw new BadRequestException('A name cannot be empty');
    return name;
  }

  private async checkedAcademyIds(academyIds: string[]): Promise<string[]> {
    const ids = [...new Set(academyIds)];
    if (ids.length === 0) return ids;
    const found = await this.prisma.academyProfile.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException('Unknown academy');
    return ids;
  }

  private nameWhere(query: string): Prisma.ProfessionalPlayerWhereInput {
    const terms = query.trim().split(/\s+/).filter(Boolean).slice(0, 3);
    return {
      AND: terms.map((term) => ({
        OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
        ],
      })),
    };
  }

  private present(row: PlayerRow) {
    const { avatarKey, academies, ...rest } = row;
    return {
      ...rest,
      avatarUrl: this.storage.publicUrlOrNull(avatarKey),
      academies: academies.map(({ academy }) => ({
        id: academy.id,
        name: academy.name,
        username: academy.username,
        logoUrl: this.storage.publicUrlOrNull(academy.logoKey),
      })),
    };
  }
}
