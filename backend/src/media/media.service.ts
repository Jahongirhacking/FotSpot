import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MediaCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';
import { StorageService } from '../storage/storage.service';
import { assertKeyUnder, playerMediaKey, playerMediaPrefix } from '../storage/storage.keys';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  ConfirmUploadDto,
  CreateMediaCommentDto,
  ListMediaCommentsDto,
  ListPlayerMediaDto,
  RequestUploadDto,
} from './dto/media.dto';

/** Highlights show off a performance; every other category evidences one bar. */
const ATTRIBUTE_CATEGORIES: MediaCategory[] = [
  'PACE',
  'DRIBBLING',
  'PASSING',
  'FINISHING',
  'PHYSICAL',
  'TECHNIQUE',
];

/**
 * Roles that may watch another player's clips.
 *
 * Recruiting roles only. Player media is footage of children, and the reason it
 * exists on this platform is so scouts, coaches and academies can evaluate it —
 * not so it can be browsed. Guests and other players get metadata (the bars, the
 * ratings, the categories) and no bytes.
 *
 * Checked against the *acting* role (§1.2.1), so a scout browsing as a player is
 * treated as a player.
 */
const VIEWER_ROLES = ['scout', 'coach', 'academy_manager', 'admin', 'super_admin'];

/**
 * What a media row looks like on the way out.
 *
 * `storageKey` is stripped. It is not a secret — nothing here treats it as one —
 * but publishing the address of every private object invites exactly the guessing
 * game this design removes, and no client has a use for it.
 */
export function toPublicMedia<T extends { storageKey: string }>(media: T) {
  const { storageKey: _storageKey, ...rest } = media;
  return rest;
}

@Injectable()
export class MediaService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private redis: RedisService,
  ) {}

  private async ownPlayerProfile(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Only players can upload media to their profile');
    return profile;
  }

  /** Whether uploads can be accepted at all — surfaced so the UI can say so
   *  before a player records a video. */
  storageStatus() {
    return { configured: this.storage.isConfigured };
  }

  /**
   * Mints the object key **server-side** and presigns a PUT for it.
   *
   * The key is derived from the caller's own profile, never from anything they
   * sent: a client that could name its own key could write into another player's
   * directory, or into the public tier.
   */
  async requestUpload(userId: string, dto: RequestUploadDto) {
    const profile = await this.ownPlayerProfile(userId);
    const storageKey = playerMediaKey(profile.id, dto.filename);
    return this.storage.createUploadUrl(storageKey, dto.contentType);
  }

  /**
   * Records an uploaded clip and, for the six attribute categories, the claim it
   * evidences.
   *
   * The newest ACTIVE clip in a category is the player's current claim for that
   * bar; earlier ones stay as history. Nothing is overwritten and nothing is
   * deleted — "my pace was 70 in July and 85 in September" is the interesting
   * part, and a schema that replaced the row would throw it away.
   *
   * The rating stays **self-reported** however good the video is. A player
   * scoring themselves is evidence of a claim, not verification of it (§1.6), and
   * the card renders it dashed until a coach signs it off. Pretending otherwise
   * would quietly destroy the distinction the platform's credibility rests on.
   */
  async confirmUpload(userId: string, dto: ConfirmUploadDto) {
    const profile = await this.ownPlayerProfile(userId);
    const isAttribute = ATTRIBUTE_CATEGORIES.includes(dto.category as MediaCategory);

    if (isAttribute && dto.selfRating === undefined) {
      throw new BadRequestException('Rate the attribute this clip is evidence for');
    }
    if (!isAttribute && dto.selfRating !== undefined) {
      throw new BadRequestException('Highlights are not evidence for a single attribute');
    }

    // The key made a round trip through the browser, so it comes back
    // attacker-controlled: re-check it addresses *this* player's own directory
    // before a row is written against it.
    assertKeyUnder(dto.storageKey, playerMediaPrefix(profile.id));

    const media = await this.prisma.media.create({
      data: {
        playerId: profile.id,
        type: dto.type,
        category: dto.category,
        storageKey: dto.storageKey,
        // Server-side, always: a timestamp a player can set is a timestamp that
        // proves nothing about when the clip was actually taken.
        selfRating: isAttribute ? dto.selfRating : null,
        title: dto.title ?? null,
        description: dto.description ?? null,
      },
    });
    // PlayersService.getPublicProfile embeds active media, so its cache is now stale.
    await this.redis.del(RedisKeys.playerProfile(profile.id));
    return toPublicMedia(media);
  }

  /**
   * A short-lived signed URL for one clip — the only way to reach the bytes.
   *
   * Authorization happens here and the URL is signed only afterwards, in that
   * order. The URL is never persisted and expires in minutes, so one copied out
   * of dev tools and pasted into a group chat is dead on arrival.
   */
  async getPlaybackUrl(mediaId: string, user: AuthUser) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      include: { player: { select: { userId: true } } },
    });
    if (!media || media.status === 'REMOVED') throw new NotFoundException('Clip not found');

    const isOwner = media.player.userId === user.userId;
    const isViewer = user.roles.some((role) => VIEWER_ROLES.includes(role));
    if (!isOwner && !isViewer) {
      throw new ForbiddenException('This clip is not public');
    }

    return this.storage.createReadUrl(media.storageKey);
  }

  /**
   * Clip metadata — never a playable address.
   *
   * Public on purpose: the ratings on this list are what draw the attribute bars,
   * so a guest looking at a profile still sees "pace 85, backed by a clip". The
   * footage itself needs `GET /media/:id/url` and an authorized caller.
   */
  async listForPlayer(playerId: string, dto: ListPlayerMediaDto = {}) {
    const items = await this.prisma.media.findMany({
      where: { playerId, status: 'ACTIVE', ...(dto.category ? { category: dto.category } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(toPublicMedia);
  }

  /**
   * A player deletes one of their own clips.
   *
   * REMOVED rather than deleted, so the moderation trail and the engagement rows
   * pointing at it survive. Dropping the newest clip in a category promotes the
   * previous one back to being the current claim, which falls out of
   * "newest ACTIVE wins" without any bookkeeping here.
   */
  async remove(userId: string, mediaId: string) {
    const profile = await this.ownPlayerProfile(userId);
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.status === 'REMOVED') throw new NotFoundException('Clip not found');
    if (media.playerId !== profile.id) {
      throw new ForbiddenException('You can only remove your own clips');
    }

    const removed = await this.prisma.media.update({
      where: { id: mediaId },
      data: { status: 'REMOVED' },
    });
    await this.redis.del(RedisKeys.playerProfile(profile.id));
    return toPublicMedia(removed);
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
