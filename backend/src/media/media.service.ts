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
import {
  assertKeyUnder,
  playerMediaKey,
  playerMediaPrefix,
  playerPosterKey,
} from '../storage/storage.keys';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  ConfirmUploadDto,
  CreateMediaCommentDto,
  ListMediaCommentsDto,
  ListPlayerMediaDto,
  RequestUploadDto,
  UpdateMediaDto,
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
 * What a media row looks like on the way out.
 *
 * `storageKey` is replaced by the URL built from it. The key stays out of
 * responses not because it is secret — clips are public and their URL is right
 * there — but because it is an internal address: callers that hold keys start
 * assembling URLs themselves, and then changing CDN or provider stops being a
 * config change. One builder, one place (StorageService).
 */
export function toMediaResponse<T extends { storageKey: string; posterKey?: string | null }>(
  media: T,
  storage: StorageService,
) {
  const { storageKey, posterKey, ...rest } = media;
  return {
    // `publicUrlOrNull`, not `buildPublicUrl`: with R2_PUBLIC_BASE_URL unset this
    // used to throw, which took the whole endpoint down with a 503 — a profile
    // could not list its clips, delete them, or render its attribute bars, all
    // because a CDN hostname was missing. Worse on confirm, where the row was
    // already written and the caller was told the upload had failed.
    //
    // A clip with no address degrades to one that cannot be played. Everything
    // else about it still works, and the UI says why.
    ...rest,
    url: storage.publicUrlOrNull(storageKey),
    posterUrl: storage.publicUrlOrNull(posterKey),
  };
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

    // Both tickets in one round trip. The browser captures the cover frame from
    // the file it already holds, so making it ask again for a second signature
    // would be a wasted request on a connection that is the scarce resource here.
    const [video, poster] = await Promise.all([
      this.storage.createUploadUrl(storageKey, dto.contentType),
      this.storage.createUploadUrl(playerPosterKey(profile.id), 'image/jpeg'),
    ]);

    return { ...video, posterUploadUrl: poster.uploadUrl, posterKey: poster.storageKey };
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
    if (dto.posterKey) assertKeyUnder(dto.posterKey, playerMediaPrefix(profile.id));

    const media = await this.prisma.media.create({
      data: {
        playerId: profile.id,
        type: dto.type,
        category: dto.category,
        storageKey: dto.storageKey,
        posterKey: dto.posterKey ?? null,
        // Server-side, always: a timestamp a player can set is a timestamp that
        // proves nothing about when the clip was actually taken.
        selfRating: isAttribute ? dto.selfRating : null,
        title: dto.title ?? null,
        description: dto.description ?? null,
      },
    });
    // PlayersService.getPublicProfile embeds active media, so its cache is now stale.
    await this.redis.del(RedisKeys.playerProfile(profile.id));
    return toMediaResponse(media, this.storage);
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
    return items.map((item) => toMediaResponse(item, this.storage));
  }

  /**
   * The uploader corrects their own clip.
   *
   * Category is not editable — see UpdateMediaDto. The rating is, because a
   * mistyped 8 for 80 otherwise strands the player with a claim they cannot fix,
   * and the clip evidencing it has not changed.
   */
  async update(userId: string, mediaId: string, dto: UpdateMediaDto) {
    const profile = await this.ownPlayerProfile(userId);
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.status === 'REMOVED') throw new NotFoundException('Clip not found');
    if (media.playerId !== profile.id) {
      throw new ForbiddenException('You can only edit your own clips');
    }
    if (dto.selfRating !== undefined && media.category === 'MATCH_HIGHLIGHTS') {
      throw new BadRequestException('Highlights are not evidence for a single attribute');
    }

    const updated = await this.prisma.media.update({
      where: { id: mediaId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() || null } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.selfRating !== undefined ? { selfRating: dto.selfRating } : {}),
      },
    });
    await this.redis.del(RedisKeys.playerProfile(profile.id));
    return toMediaResponse(updated, this.storage);
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
    return toMediaResponse(removed, this.storage);
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

  /**
   * Counts, plus whether the caller has already liked this.
   *
   * `likedByMe` is keyed on user id and nothing else. A like is one per account —
   * the unique constraint is `(mediaId, userId)`, so switching from scout to
   * admin and pressing it again upserts the same row rather than adding a second.
   * That is the behaviour, not an accident of it, and the flag is what lets the
   * button render the truth instead of guessing.
   */
  async getEngagement(mediaId: string, userId?: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.status !== 'ACTIVE') throw new NotFoundException('Media not found');

    const [views, likes, comments, mine] = await this.prisma.$transaction([
      this.prisma.mediaView.count({ where: { mediaId } }),
      this.prisma.mediaLike.count({ where: { mediaId } }),
      this.prisma.mediaComment.count({ where: { mediaId, status: 'ACTIVE' } }),
      this.prisma.mediaLike.count({ where: { mediaId, ...(userId ? { userId } : { userId: '' }) } }),
    ]);

    return { mediaId, views, likes, comments, likedByMe: Boolean(userId) && mine > 0 };
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
