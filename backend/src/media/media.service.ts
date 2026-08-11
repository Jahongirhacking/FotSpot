import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MediaCategory, Prisma } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { GroupsService } from '../academies/groups.service';
import { pageOf, toSkipTake } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';
import {
  assertKeyUnder,
  playerMediaKey,
  playerMediaPrefix,
  playerPosterKey,
} from '../storage/storage.keys';
import { StorageService } from '../storage/storage.service';
import { TariffsService } from '../tariffs/tariffs.service';
import {
  ConfirmUploadDto,
  CreateMediaCommentDto,
  FeedDto,
  ListMediaCommentsDto,
  ListPlayerMediaDto,
  RateMediaDto,
  RequestUploadDto,
  UpdateMediaDto,
} from './dto/media.dto';
import {
  FINALISE_ATTEMPTS,
  FINALISE_BACKOFF_MS,
  FINALISE_CLIP_JOB,
  MEDIA_QUEUE,
  type FinaliseClipJob,
} from './media-processing.constants';

/**
 * How long one viewer stays counted for one clip.
 *
 * A day: long enough that a page refresh, a re-watch or a second tab is the
 * same view, short enough that genuinely coming back later still registers.
 */
const VIEW_DEDUPE_SECONDS = 24 * 60 * 60;

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

/**
 * How hard a clip the viewer has already watched is pushed down.
 *
 * Large enough to outweigh every positive term combined: the strongest possible
 * signal that a clip is not worth this viewer's next sixty seconds is that they
 * have already spent sixty seconds on it. A feed that keeps re-showing the same
 * video is the complaint this answers, and a gentle nudge would not fix it —
 * a clip with a Legendary Scout behind it would still climb straight back.
 */
const FEED_SEEN_PENALTY = 12;

/**
 * How long a watched clip stays fully suppressed.
 *
 * An hour, then the penalty tapers off. Not permanent exclusion: a scout does
 * come back to a player they are weighing up, and a clip they saw last week is
 * a legitimate thing to surface again — just not the thing to open with.
 */
const FEED_SEEN_COOLDOWN_SECONDS = 60 * 60;

/**
 * A liked clip is done with, more so than a watched one.
 *
 * Liking is the most deliberate signal the product has: the viewer looked, made
 * up their mind and said so. Showing it again asks a question they have already
 * answered. It still counts *toward* what they are shown next — see the affinity
 * term, which is built entirely from likes.
 */
const FEED_LIKED_PENALTY = 20;

/**
 * Weight on "this looks like the clips you have liked".
 *
 * Affinity is measured by category, which is the one axis of similarity the data
 * actually carries: every clip is filed under the attribute it evidences (§21.1),
 * so a viewer who keeps liking FINISHING clips is telling us what they are
 * scouting for. Normalised against their own like count, so it says "what
 * fraction of your likes were this kind" rather than rewarding heavy users.
 *
 * Deliberately smaller than the earned-weight term: it should colour the order,
 * not narrow the feed to one attribute and hide every other player from view.
 */
const FEED_AFFINITY_TERM = 1.8;

/**
 * Extra lift for an unseen clip from somebody the viewer follows.
 *
 * On top of the flat follow bonus, and conditional on *unseen*: "a new video
 * from someone I follow" is the single most reliable thing a feed can offer, and
 * separating it from the plain follow term is what stops an old clip from a
 * followed player crowding out their new one.
 */
const FEED_FOLLOWED_UNSEEN_TERM = 2.5;

/** One row of the feed query, before URLs are signed onto it. */
interface FeedRow {
  id: string;
  type: string;
  category: MediaCategory;
  storageKey: string;
  posterKey: string | null;
  rating: number | null;
  reportedBy: 'SELF' | 'COACH';
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
  /** Whether this viewer has already watched it — drives the seen penalty. */
  seenByMe: boolean;
}

@Injectable()
export class MediaService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private redis: RedisService,
    private groups: GroupsService,
    private tariffs: TariffsService,
    @InjectQueue(MEDIA_QUEUE) private queue: Queue<FinaliseClipJob>,
  ) {}

  private async ownPlayerProfile(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Only players can upload media to their profile');
    return profile;
  }

  /**
   * Whether uploads can be accepted at all, and how many this player has left —
   * surfaced so the UI can say so before a player records a video.
   *
   * The quota rides along with the storage flag because both answer the same
   * question from the uploader's point of view: "can I add a clip right now".
   * Two requests to answer one question is how a screen ends up showing the
   * upload button to somebody who cannot use it.
   */
  async storageStatus(userId: string) {
    const player = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return {
      configured: this.storage.isConfigured,
      quota: player ? await this.tariffs.clipQuota(userId) : null,
    };
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
    // Checked before the ticket is signed, so a player on a phone is told they
    // are out of uploads *before* spending their data on the video rather than
    // after. It is checked again in `confirmUpload`, which is the boundary that
    // actually counts: a signed ticket outlives this call and could be replayed.
    await this.tariffs.assertCanUploadClip(userId);
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
    // The row is what the plan limits, so this is the check that matters.
    await this.tariffs.assertCanUploadClip(userId);
    const isAttribute = ATTRIBUTE_CATEGORIES.includes(dto.category as MediaCategory);

    if (isAttribute && dto.rating === undefined) {
      throw new BadRequestException('Rate the attribute this clip is evidence for');
    }
    if (!isAttribute && dto.rating !== undefined) {
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
        rating: isAttribute ? dto.rating : null,
        title: dto.title ?? null,
        description: dto.description ?? null,
        // PROCESSING by the column default — this call is the *client's word*
        // that an upload happened, and the worker is what checks. See
        // MediaProcessor.
      },
    });

    /*
     * The job that decides whether this clip is real.
     *
     * `jobId` is the media id, so BullMQ deduplicates: a double-tapped confirm,
     * or a retry from a flaky connection, cannot queue two workers racing to
     * finalise the same row.
     *
     * Enqueued after the row exists, deliberately — a worker that started first
     * would look up a media id that had not been written yet.
     */
    await this.queue.add(
      FINALISE_CLIP_JOB,
      { mediaId: media.id, storageKey: media.storageKey, posterKey: media.posterKey },
      {
        jobId: media.id,
        attempts: FINALISE_ATTEMPTS,
        backoff: { type: 'exponential', delay: FINALISE_BACKOFF_MS },
      },
    );

    // No cache invalidation here any more: the clip is not visible yet, so there
    // is nothing stale to clear. The worker does it at the moment the clip
    // actually appears.
    return toMediaResponse(media, this.storage);
  }

  /**
   * Clip metadata — never a playable address.
   *
   * Public on purpose: the ratings on this list are what draw the attribute bars,
   * so a guest looking at a profile still sees "pace 85, backed by a clip". The
   * footage itself needs `GET /media/:id/url` and an authorized caller.
   */
  async listForPlayer(playerId: string, dto: ListPlayerMediaDto = {}, viewerUserId?: string) {
    const { skip, take, page, pageSize } = toSkipTake(dto);

    /*
     * The owner sees their own clips while they are still being finalised.
     *
     * Everyone else sees only ACTIVE, which is what makes PROCESSING meaningful:
     * a clip is not evidence until the worker has found it in the bucket. But
     * hiding it from the uploader too would mean pressing upload and watching
     * nothing appear — indistinguishable from a failure, and the moment they
     * would upload it again.
     */
    const owner = viewerUserId
      ? await this.prisma.playerProfile.findFirst({
          where: { id: playerId, userId: viewerUserId },
          select: { id: true },
        })
      : null;

    const where: Prisma.MediaWhereInput = {
      playerId,
      status: owner ? { in: ['ACTIVE', 'PROCESSING', 'FAILED'] } : 'ACTIVE',
      ...(dto.category ? { category: dto.category } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.media.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.media.count({ where }),
    ]);

    // Signing is local HMAC — no network — so a page of tiles costs microseconds,
    // not a round trip each.
    const items = await Promise.all(rows.map((item) => toMediaResponse(item, this.storage)));
    return pageOf(items, total, { page, pageSize });
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
   * exists: `PlayerRecommendationWeight.globalWeight`, the sum of what scouts
   * have staked on that player (§1.5). The feed leans on it rather than
   * inventing a second, competing notion of merit.
   *
   * ## What the viewer has already done outranks everything else
   *
   * The two strongest signals in the score are negative, because the loudest
   * complaint a feed can produce is "why am I being shown this again". A clip
   * the viewer has **watched** is suppressed for an hour and demoted after that;
   * a clip they have **liked** is demoted harder still and effectively does not
   * come back. Liking is the most deliberate judgement the product offers — the
   * viewer looked, decided, and said so — and re-showing it asks a question they
   * have already answered.
   *
   * Those likes are not discarded, they change direction: they become the
   * affinity term, which is how "more like the ones you liked" is expressed.
   *
   * ## The terms, in order of how much they move the result
   *
   * - **Seen penalty** (negative). Full strength within the hour after viewing,
   *   tapering afterwards, so a clip can eventually resurface without being the
   *   thing the feed opens with.
   * - **Liked penalty** (negative), flat and larger. No cooldown: a decided clip
   *   stays decided.
   * - **Earned weight**, `ln(1 + globalWeight)`. Logarithmic on purpose: the
   *   weights are geometric (1, 3, 8, 20, 50, 125), so untransformed they would
   *   let a handful of Legendary Scout picks own the feed outright and bury every
   *   player nobody has recommended yet — which is precisely the child this
   *   product exists to surface.
   * - **New from a followed player**. A follow bonus, plus an extra lift when the
   *   clip is also unseen — which is what makes "somebody I follow posted
   *   something new" the reliable top of the feed rather than the same followed
   *   clip every visit.
   * - **Affinity**, the share of the viewer's own likes that fell in this clip's
   *   category. Category is the one axis of similarity the data really carries:
   *   every clip is filed under the attribute it evidences (§21.1), so a viewer
   *   who keeps liking FINISHING clips has said what they are scouting for.
   *   Normalised by their like count, so it is a proportion rather than a reward
   *   for volume, and weighted below earned merit so it colours the order instead
   *   of narrowing the feed to a single attribute.
   * - **Likes**, `ln(1 + likes)`, damped for the same reason as weight. With the
   *   seen penalty beside it this is what surfaces *popular clips the viewer has
   *   not watched yet*.
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
        m.id, m.type, m.category, m."storageKey", m."posterKey", m.rating, m."reportedBy",
        m.title, m.description, m."createdAt",
        p.id AS "playerId", p."firstName", p."lastName", p."birthDate",
        p."primaryPosition", p.region,
        u."avatarKey",
        COALESCE(l.likes, 0)::int AS likes,
        COALESCE(v.views, 0)::int AS views,
        (ml."userId" IS NOT NULL) AS "likedByMe",
        (f.id IS NOT NULL) AS following,
        (mv."lastViewedAt" IS NOT NULL) AS "seenByMe"
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
      -- When this viewer last watched this clip. MediaView is an event log with
      -- a row per viewing, so the *most recent* one is what the cooldown reads.
      LEFT JOIN (
        SELECT "mediaId", MAX("createdAt") AS "lastViewedAt"
        FROM "MediaView"
        WHERE "userId" = ${viewerUserId}
        GROUP BY "mediaId"
      ) mv ON mv."mediaId" = m.id
      -- What share of this viewer's likes fell in each category. One pass over
      -- their own likes, joined by category rather than per row.
      LEFT JOIN (
        SELECT lm.category,
               COUNT(*)::float / NULLIF(SUM(COUNT(*)) OVER (), 0) AS affinity
        FROM "MediaLike" lk
        JOIN "Media" lm ON lm.id = lk."mediaId"
        WHERE lk."userId" = ${viewerUserId}
        GROUP BY lm.category
      ) aff ON aff.category = m.category
      WHERE m.status = 'ACTIVE' AND m.type = 'VIDEO' AND u."isPrivate" = false
      ORDER BY
        ${FEED_WEIGHT_TERM} * ln(1 + COALESCE(w."globalWeight", 0))
        + ${FEED_FOLLOW_TERM} * (CASE WHEN f.id IS NULL THEN 0 ELSE 1 END)
        -- "Something new from someone I follow" — the follow bonus only counts
        -- twice while the clip is still unwatched.
        + ${FEED_FOLLOWED_UNSEEN_TERM}
          * (CASE WHEN f.id IS NOT NULL AND mv."lastViewedAt" IS NULL THEN 1 ELSE 0 END)
        + ${FEED_AFFINITY_TERM} * COALESCE(aff.affinity, 0)
        + ${FEED_LIKES_TERM} * ln(1 + COALESCE(l.likes, 0))
        + ${FEED_FRESHNESS_TERM}
          * exp(-EXTRACT(EPOCH FROM (now() - m."createdAt")) / ${FEED_HALF_LIFE_SECONDS})
        -- Already watched: full penalty for the first hour, then decaying, so a
        -- clip can resurface later without ever opening the feed.
        - ${FEED_SEEN_PENALTY}
          * (CASE
               WHEN mv."lastViewedAt" IS NULL THEN 0
               WHEN now() - mv."lastViewedAt"
                    < make_interval(secs => ${FEED_SEEN_COOLDOWN_SECONDS}) THEN 1
               ELSE exp(
                 -(EXTRACT(EPOCH FROM (now() - mv."lastViewedAt")) - ${FEED_SEEN_COOLDOWN_SECONDS})
                 / ${FEED_HALF_LIFE_SECONDS}
               )
             END)
        -- Already liked: decided, and it stays decided.
        - ${FEED_LIKED_PENALTY} * (CASE WHEN ml."userId" IS NULL THEN 0 ELSE 1 END)
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
    if (dto.rating !== undefined && media.category === 'MATCH_HIGHLIGHTS') {
      throw new BadRequestException('Highlights are not evidence for a single attribute');
    }

    const updated = await this.prisma.media.update({
      where: { id: mediaId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() || null } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        // A player editing their own clip is making a claim again, even if a
        // coach had corrected it — so the source goes back to SELF and the
        // coach's number is kept in the revision trail rather than silently lost.
        ...(dto.rating !== undefined ? { rating: dto.rating, reportedBy: 'SELF' as const } : {}),
      },
    });
    await this.redis.del(RedisKeys.playerProfile(profile.id));
    return toMediaResponse(updated, this.storage);
  }

  /**
   * A coach replaces the rating on a clip.
   *
   * The clip carries one current rating and a note of who put it there, so a
   * coach correcting a player's 90 to a 60 does not leave two numbers on screen
   * for the reader to choose between — it leaves one, marked as a coach's.
   *
   * Only a verified coach **from the player's own group**, for the same reason
   * only such a coach can file an assessment (README §1.9, TRIAL.md Rule 21): a
   * number on a clip is an attribute judgement like any other, and the whole
   * value of the distinction is that it cannot be self-awarded (§1.6) — or
   * awarded by a stranger who happens to hold the coach role.
   *
   * The previous value is written to `RatingRevision` first. A coach lowering a
   * fourteen-year-old's own number is exactly the edit somebody may ask about
   * later, and "who changed it, from what, when" should not depend on anyone
   * having thought to take a screenshot.
   */
  async rate(userId: string, mediaId: string, dto: RateMediaDto) {
    const coach = await this.prisma.coachProfile.findUnique({ where: { userId } });
    if (!coach || coach.status !== 'VERIFIED') {
      throw new ForbiddenException('Only a verified coach can rate a clip');
    }

    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.status === 'REMOVED') throw new NotFoundException('Clip not found');
    if (media.category === 'MATCH_HIGHLIGHTS') {
      throw new BadRequestException('Highlights are not evidence for a single attribute');
    }

    await this.groups.assertCoachesPlayer(userId, media.playerId);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.ratingRevision.create({
        data: {
          mediaId,
          previousRating: media.rating,
          previousReportedBy: media.reportedBy,
          rating: dto.rating,
          reportedBy: 'COACH',
          actorUserId: userId,
        },
      });

      return tx.media.update({
        where: { id: mediaId },
        data: { rating: dto.rating, reportedBy: 'COACH' },
      });
    });

    // The card and the bars are drawn from this player's cached profile.
    await this.redis.del(RedisKeys.playerProfile(media.playerId));
    return toMediaResponse(updated, this.storage);
  }

  /** What a clip's rating was before each change, newest first. */
  async ratingHistory(mediaId: string) {
    return this.prisma.ratingRevision.findMany({
      where: { mediaId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
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
  /**
   * Counts one view, at most once per viewer per clip per hour.
   *
   * ## Why this is deduplicated at all, when a view is an event
   *
   * `MediaView` is deliberately not unique per (media, user) — a view is
   * something that happens, not a state, which is what makes "watched three
   * times this week" answerable. That reasoning still holds; what it never
   * accounted for is that the endpoint takes no token and writes a row, so an
   * anonymous loop can grow the largest table in the database without limit and
   * inflate any player's numbers to whatever it likes.
   *
   * An hour-long claim keeps both properties: repeat viewing on different days
   * still registers as separate events, and a script gets one row an hour per
   * address instead of one per request. `ThrottleGuard` bounds the request rate;
   * this bounds what the requests can *write*, which is the part that persists.
   *
   * The claim fails closed when Redis is down — an outage drops views rather
   * than reopening unbounded insertion, and a lost view counter is recoverable
   * while a table full of fabricated rows is not.
   */
  async recordView(mediaId: string, viewer: { userId?: string; ipAddress?: string }) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.status !== 'ACTIVE') throw new NotFoundException('Media not found');

    // The account when there is one, so the same person is counted once whatever
    // network they are on; the address otherwise, which is all a guest offers.
    const identity = viewer.userId ?? (viewer.ipAddress ? `ip:${viewer.ipAddress}` : null);
    if (!identity) return { recorded: false };

    const fresh = await this.redis.claimOnce(
      RedisKeys.mediaViewClaim(mediaId, identity),
      VIEW_DEDUPE_SECONDS,
    );
    if (!fresh) return { recorded: false };

    await this.prisma.mediaView.create({
      data: { mediaId, userId: viewer.userId ?? null },
    });
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
