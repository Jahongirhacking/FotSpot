import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';
import { R2StorageService } from './r2-storage.service';
import {
  ConfirmUploadDto,
  CreateMediaCommentDto,
  ListMediaCommentsDto,
  RequestUploadDto,
} from './dto/media.dto';

@Injectable()
export class MediaService {
  constructor(
    private prisma: PrismaService,
    private storage: R2StorageService,
    private redis: RedisService,
  ) {}

  private async ownPlayerProfile(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Only players can upload media to their profile');
    return profile;
  }

  async requestUpload(userId: string, dto: RequestUploadDto) {
    const profile = await this.ownPlayerProfile(userId);
    return this.storage.getUploadUrl(profile.id, dto.filename);
  }

  async confirmUpload(userId: string, dto: ConfirmUploadDto) {
    const profile = await this.ownPlayerProfile(userId);
    const base = process.env.R2_PUBLIC_BASE_URL ?? '';
    const media = await this.prisma.media.create({
      data: {
        playerId: profile.id,
        type: dto.type,
        category: dto.category,
        storageKey: dto.storageKey,
        url: `${base}/${dto.storageKey}`,
      },
    });
    // PlayersService.getPublicProfile embeds active media, so its cache is now stale.
    await this.redis.del(RedisKeys.playerProfile(profile.id));
    return media;
  }

  async listForPlayer(playerId: string) {
    return this.prisma.media.findMany({
      where: { playerId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async like(userId: string, mediaId: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.status !== 'ACTIVE') throw new NotFoundException('Media not found');

    return this.prisma.mediaLike.upsert({
      where: { mediaId_userId: { mediaId, userId } },
      update: {},
      create: { mediaId, userId },
    });
  }

  async unlike(userId: string, mediaId: string) {
    await this.prisma.mediaLike
      .delete({
        where: { mediaId_userId: { mediaId, userId } },
      })
      .catch(() => undefined);
    return { unliked: true };
  }

  // ---------- Views (1.14 media_views) ----------

  /**
   * Records a view. `userId` is null for guests, who may view public media (1.2).
   * Unlike a like, a view is an event rather than a state, so repeat views are
   * separate rows and there is no unique constraint to upsert against.
   *
   * Not pushed over WebSocket by deliberate design - 1.17 lists views among the
   * high-volume, low-value events that must never hit the notification channel.
   */
  async recordView(mediaId: string, userId?: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.status !== 'ACTIVE') throw new NotFoundException('Media not found');

    await this.prisma.mediaView.create({ data: { mediaId, userId: userId ?? null } });
    return { recorded: true };
  }

  async getEngagement(mediaId: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.status !== 'ACTIVE') throw new NotFoundException('Media not found');

    const [views, likes, comments] = await this.prisma.$transaction([
      this.prisma.mediaView.count({ where: { mediaId } }),
      this.prisma.mediaLike.count({ where: { mediaId } }),
      this.prisma.mediaComment.count({ where: { mediaId, status: 'ACTIVE' } }),
    ]);

    return { mediaId, views, likes, comments };
  }

  // ---------- Comments (1.14 media_comments) ----------

  async comment(userId: string, mediaId: string, dto: CreateMediaCommentDto) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.status !== 'ACTIVE') throw new NotFoundException('Media not found');

    return this.prisma.mediaComment.create({
      data: { mediaId, userId, body: dto.body },
    });
  }

  async listComments(mediaId: string, dto: ListMediaCommentsDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const where = { mediaId, status: 'ACTIVE' as const };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.mediaComment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mediaComment.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /** Author deletes their own comment; moderators use the moderation module. */
  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.mediaComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) {
      throw new ForbiddenException('Only the author can delete this comment');
    }

    await this.prisma.mediaComment.update({
      where: { id: commentId },
      data: { status: 'REMOVED' },
    });
    return { deleted: true };
  }
}
