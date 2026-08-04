import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MediaCategory, Prisma } from '@prisma/client';
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
  FeedDto,
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
/**
 * A media row on the way out, with playable URLs.
 *
 * ## Presigned, not CDN
 *
 * Both URLs are signed against the R2 S3 endpoint rather than composed from a
 * public hostname. That means clips work with nothing but the credentials the API
 * already holds — no public bucket access, no custom domain, no
 * `R2_PUBLIC_BASE_URL`. The missing-hostname outage that produced 503s on every
 * media endpoint simply cannot happen through this path.
 *
 * The signature carries an expiry because SigV4 has no way not to. It is set to
 * the seven-day maximum and re-minted on every read, so the app never hands out a
 * URL near its deadline and a clip stays reachable for as long as it exists —
 * deletion, not time, is what ends it. Within any given hour the signature is
 * identical, so the browser can still serve a rewatch from cache.
 *
 * `storageKey` stays out of the response: a caller holding keys starts building
 * its own URLs, and then changing provider stops being a config change.
 */
export async function toMediaResponse<T extends { storageKey: string; posterKey?: string | null }>(
  media: T,
  storage: StorageService,
) {
  const { storageKey, posterKey, ...rest } = media;
  const [url, posterUrl] = await Promise.all([
    storage.readUrlOrNull(storageKey),
    storage.readUrlOrNull(posterKey),
  ]);
  return { ...rest, url, posterUrl };
}

/**
 * Feed scoring weights. Relative size is the whole design: earned weight leads,
 * a follow is worth roughly what a well-liked clip is worth, and freshness can
 * lift a brand-new clip above an older one of similar standing but never above a
 * strongly recommended player.
 */
const FEED_WEIGHT_TERM = 3;
const FEED_FOLLOW_TERM = 2;
const FEED_LIKES_TERM = 0.8;
const FEED_FRESHNESS_TERM = 1.5;
/** One week, in seconds — the half-life of the freshness term. */
const FEED_HALF_LIFE_SECONDS = 7 * 24 * 60 * 60;

/** One row of the feed query, before URLs are signed onto it. */
interface FeedRow {
  id: string;
  type: string;
  category: MediaCategory;
  storageKey: string;
  posterKey: string | null;
  selfRating: number | null;
  title: string | null;
  description: string | null;
  createdAt: Date;
  playerId: string;
  firstName: string;
  lastName: string;
  birthDate: Date;
  primaryPosition: string | null;
  region: string | null;
  avatarKey: string | null;
  likes: number;
  views: number;
  likedByMe: boolean;
  following: boolean;
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
    // Signing is local HMAC — no network — so a page of tiles costs microseconds,
    // not a round trip each.
    return Promise.all(items.map((item) => toMediaResponse(item, this.storage)));
  }

  /**
   * The newest clips across the platform, with the player each belongs to.
   *
   * ## Why this endpoint exists
   *
   * The landing page was fetching a page of players and then one media request
   * per player — seven round trips to render one strip, on the busiest and most
   * public page in the product, for visitors who are by definition on the worst
   * connection they will ever have here. Classic N+1, just spread across HTTP
   * rather than hidden in a loop over the database.
   *
   * It also asked the wrong question. "Clips belonging to the six newest players"
   * is not what a *recent clips* strip means, and it goes empty the moment those
   * six happen not to have uploaded anything. This asks for what the strip
   * actually shows, and gets it in one indexed query ordered by `createdAt`.
   */
  async listRecent(limit = 8) {
    const items = await this.prisma.media.findMany({
      where: { status: 'ACTIVE', player: { user: { isPrivate: false } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 24),
      include: {
        player: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            primaryPosition: true,
            region: true,
          },
        },
      },
    });

    return Promise.all(
      items.map(async ({ player, ...media }) => ({
        ...(await toMediaResponse(media, this.storage)),
        player,
      })),
    );
  }

  /**
   * The ranked feed: every player's clips, ordered by who has earned attention.
   *
   * ## What "ranked" means here
   *
   * A scout opening the app should see the clips most worth their next sixty
   * seconds, and the platform's own answer to "who is worth watching" already
   * exists: `PlayerRecommendationWeight.globalWeight`, the decaying sum of what
   * scouts have staked on that player (§1.5). The feed leans on it rather than
   * inventing a second, competing notion of merit.
   *
   * Four terms, in order of how much they move the result:
   *
   * - **Earned weight**, `ln(1 + globalWeight)`. Logarithmic on purpose: the
   *   weights are geometric (1, 3, 8, 20, 50, 125), so untransformed they would
   *   let a handful of Legendary Scout picks own the feed outright and bury every
   *   player nobody has recommended yet — which is precisely the child this
   *   product exists to surface.
   * - **Following**, a flat bonus. Asked for directly: a scout who followed a
   *   player wants that player's new clip near the top, and a flat term does that
   *   without letting one follow outrank all merit.
   * - **Likes**, `ln(1 + likes)`, damped for the same reason as weight.
   * - **Freshness**, an exponential decay with a one-week half-life. Without it a
   *   good clip from March outranks everything uploaded since, forever.
   *
   * ## Why raw SQL, in a codebase that has none
   *
   * The ordering *is* the score, and the score is computed from four tables. Doing
   * it in Prisma means fetching a candidate window and ranking in memory, which
   * makes page 2 an incoherent question — items would reshuffle between pages and
   * the same clip could appear twice or never. The database can sort a computed
   * expression; it is the only thing here that can.
   *
   * Interpolations are parameterised by `Prisma.sql`, so the viewer id and paging
   * numbers cannot be anything but values.
   */
  async feed(viewerUserId: string, dto: FeedDto = {}) {
    const page = Math.max(1, dto.page ?? 1);
    const pageSize = Math.min(24, Math.max(1, dto.pageSize ?? 6));
    const skip = (page - 1) * pageSize;

    const rows = await this.prisma.$queryRaw<FeedRow[]>(Prisma.sql`
      SELECT
        m.id, m.type, m.category, m."storageKey", m."posterKey", m."selfRating",
        m.title, m.description, m."createdAt",
        p.id AS "playerId", p."firstName", p."lastName", p."birthDate",
        p."primaryPosition", p.region,
        u."avatarKey",
        COALESCE(l.likes, 0)::int AS likes,
        COALESCE(v.views, 0)::int AS views,
        (ml."userId" IS NOT NULL) AS "likedByMe",
        (f.id IS NOT NULL) AS following
      FROM "Media" m
      JOIN "PlayerProfile" p ON p.id = m."playerId"
      JOIN "User" u ON u.id = p."userId"
      LEFT JOIN "PlayerRecommendationWeight" w ON w."playerId" = p.id
      LEFT JOIN (SELECT "mediaId", COUNT(*) AS likes FROM "MediaLike" GROUP BY "mediaId") l
        ON l."mediaId" = m.id
      LEFT JOIN (SELECT "mediaId", COUNT(*) AS views FROM "MediaView" GROUP BY "mediaId") v
        ON v."mediaId" = m.id
      LEFT JOIN "MediaLike" ml ON ml."mediaId" = m.id AND ml."userId" = ${viewerUserId}
      LEFT JOIN "Follow" f
        ON f."followerId" = ${viewerUserId} AND f."targetType" = 'PLAYER' AND f."targetId" = p.id
      WHERE m.status = 'ACTIVE' AND m.type = 'VIDEO' AND u."isPrivate" = false
      ORDER BY
        ${FEED_WEIGHT_TERM} * ln(1 + COALESCE(w."globalWeight", 0))
        + ${FEED_FOLLOW_TERM} * (CASE WHEN f.id IS NULL THEN 0 ELSE 1 END)
        + ${FEED_LIKES_TERM} * ln(1 + COALESCE(l.likes, 0))
        + ${FEED_FRESHNESS_TERM}
          * exp(-EXTRACT(EPOCH FROM (now() - m."createdAt")) / ${FEED_HALF_LIFE_SECONDS})
        DESC,
        m."createdAt" DESC
      LIMIT ${pageSize} OFFSET ${skip}
    `);

    const total = await this.prisma.media.count({
      where: { status: 'ACTIVE', type: 'VIDEO', player: { user: { isPrivate: false } } },
    });

    const items = await Promise.all(
      rows.map(
        async ({
          playerId,
          firstName,
          lastName,
          birthDate,
          primaryPosition,
          region,
          avatarKey,
          likes,
          views,
          likedByMe,
          following,
          ...media
        }) => ({
          ...(await toMediaResponse(media, this.storage)),
          likes,
          views,
          likedByMe,
          following,
          player: {
            id: playerId,
            firstName,
            lastName,
            birthDate,
            primaryPosition,
            region,
            avatarUrl: this.storage.publicUrlOrNull(avatarKey),
          },
        }),
      ),
    );

    return { items, total, page, pageSize };
  }

  /**
   * Players worth following, for the panel beside the feed.
   *
   * Ranked by the same earned weight, minus anyone the viewer already follows and
   * the viewer themselves — a suggestion you have already taken is not a
   * suggestion. Players with no weight yet are included rather than filtered out,
   * ordered behind those with some, so a new academy's intake is reachable.
   */
  async suggestedPlayers(viewerUserId: string, limit = 5) {
    const take = Math.min(20, Math.max(1, limit));

    const following = await this.prisma.follow.findMany({
      where: { followerId: viewerUserId, targetType: 'PLAYER' },
      select: { targetId: true },
    });

    const players = await this.prisma.playerProfile.findMany({
      where: {
        id: { notIn: following.map((row) => row.targetId) },
        userId: { not: viewerUserId },
        // Private accounts are not suggested to anyone.
        user: { isPrivate: false },
      },
      // One indexed pass over the weight table rather than a query per player.
      orderBy: [{ recommendationWeight: { globalWeight: 'desc' } }, { createdAt: 'desc' }],
      take,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        primaryPosition: true,
        region: true,
        user: { select: { avatarKey: true } },
        recommendationWeight: { select: { globalWeight: true, recommendationCount: true } },
      },
    });

    return players.map(({ user, recommendationWeight, ...player }) => ({
      ...player,
      avatarUrl: this.storage.publicUrlOrNull(user?.avatarKey),
      globalWeight: recommendationWeight?.globalWeight ?? 0,
      recommendationCount: recommendationWeight?.recommendationCount ?? 0,
    }));
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
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
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
      this.prisma.mediaLike.count({
        where: { mediaId, ...(userId ? { userId } : { userId: '' }) },
      }),
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
