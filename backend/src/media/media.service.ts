import {
  Logger,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MediaCategory, Prisma, type MediaModerationStatus } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { GroupsService } from '../academies/groups.service';
import { startOfUtcDay } from './view-day.util';
import { parseRecordedAt } from './recorded-at.util';
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
import { TelegramAdminAlertsService } from '../telegram/telegram-admin-alerts.service';
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
import { MediaFinaliserService } from './media-finaliser.service';
import {
  canViewMedia,
  isPubliclyVisible,
  OWN_MEDIA_WHERE,
  PUBLIC_MEDIA_WHERE,
} from './media-visibility.util';
import {
  FINALISE_ATTEMPTS,
  INLINE_FINALISE_ATTEMPTS,
  INLINE_FINALISE_DELAY_MS,
  FINALISE_BACKOFF_MS,
  FINALISE_CLIP_JOB,
  MEDIA_QUEUE,
  TRANSCODE_ATTEMPTS,
  TRANSCODE_BACKOFF_MS,
  TRANSCODE_CLIP_JOB,
  type FinaliseClipJob,
} from './media-processing.constants';

/**
 * How long one viewer stays counted for one clip.
 *
 * A day: long enough that a page refresh, a re-watch or a second tab is the
 * same view, short enough that genuinely coming back later still registers.
 */
const VIEW_DEDUPE_SECONDS = 24 * 60 * 60;

/**
 * How long a signed URL for a clip that has not been cleared stays valid.
 *
 * See `toMediaResponse`. Long enough for a moderator to watch a minute of video
 * and for a player to check their own upload; short enough that a block takes
 * effect in minutes rather than at the end of the week the signature would
 * otherwise have run for.
 */
const UNREVIEWED_READ_URL_TTL_SECONDS = 15 * 60;

/** Highlights show off a performance; every other category evidences one bar. */
const ATTRIBUTE_CATEGORIES: MediaCategory[] = [
  'PACE',
  'DRIBBLING',
  'PASSING',
  'FINISHING',
  'PHYSICAL',
  'TECHNIQUE',
  'GOALKEEPING',
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
export async function toMediaResponse<
  T extends {
    storageKey: string;
    posterKey?: string | null;
    moderationStatus?: MediaModerationStatus;
  },
>(media: T, storage: StorageService) {
  const { storageKey, posterKey, ...rest } = media;

  /*
   * A clip nobody has cleared gets a short-lived signature.
   *
   * Seven days is right for a verified clip: it is meant to stay watchable until
   * its player deletes it, and a fresh URL is minted on every read so nobody ever
   * holds one near its deadline. It is wrong for the two states below. An
   * unverified clip is signed for exactly two audiences — its uploader, and the
   * admin reviewing it — and if that admin blocks it, a week-long URL they were
   * handed a minute earlier still plays. Blocking has to take effect when it is
   * pressed, not when a signature happens to lapse.
   *
   * Fifteen minutes is longer than any review or self-check takes and short
   * enough that a leaked link is worthless by the time it travels. Undefined
   * means the caller did not select the column (the feed's raw SQL), and that
   * query already demands VERIFIED — so it takes the long TTL, correctly.
   */
  const ttl =
    media.moderationStatus && media.moderationStatus !== 'VERIFIED'
      ? UNREVIEWED_READ_URL_TTL_SECONDS
      : undefined;

  const [url, posterUrl] = await Promise.all([
    storage.readUrlOrNull(storageKey, ttl),
    storage.readUrlOrNull(posterKey, ttl),
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
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private redis: RedisService,
    private groups: GroupsService,
    private tariffs: TariffsService,
    @InjectQueue(MEDIA_QUEUE) private queue: Queue<FinaliseClipJob>,
    private finaliser: MediaFinaliserService,
    private adminAlerts: TelegramAdminAlertsService,
  ) {}

  private async ownPlayerProfile(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Only players can upload media to their profile');
    return profile;
  }

  /**
   * The clip, or 404 — for every endpoint a non-owner can reach.
   *
   * ## 404 and not 403
   *
   * A 403 on an unverified clip would answer the question the id was guessed to
   * ask: it confirms the clip exists, who it belongs to and that something about
   * it is being withheld. To anyone who is not its owner an unreviewed or blocked
   * clip does not exist, and that is what the response says.
   *
   * Every interaction goes through here — liking, viewing, commenting, counting,
   * a coach's rating — because "cannot see it in the feed" is not the property
   * being defended. The property is that no unreviewed footage of a child leaves
   * this API by any route at all, and an endpoint that takes an id and skips this
   * check is a route.
   */
  private async publicMedia(mediaId: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!isPubliclyVisible(media)) throw new NotFoundException('Media not found');
    return media!;
  }

  /**
   * The caller's own PlayerProfile id, or null if they have no player profile.
   *
   * Read from the authenticated user id and nothing else. Ownership is never a
   * value the client supplies — a `?owner=true` or a player id in the body would
   * make every unreviewed clip on the platform one query parameter away.
   */
  private async ownPlayerId(userId: string | undefined): Promise<string | null> {
    if (!userId) return null;
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  /**
   * A clip this caller is allowed to read, or 404 — the gate on every endpoint
   * that takes a media id.
   *
   * Public if it is verified, plus the owner's own at any moderation stage. The
   * ownership half costs one indexed lookup, and only when the clip is not
   * already public: for the overwhelmingly common case — anyone watching a
   * verified clip — this is exactly the single query it always was.
   */
  private async viewableMedia(mediaId: string, viewerUserId?: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('Media not found');
    if (isPubliclyVisible(media)) return media;

    if (!canViewMedia(media, await this.ownPlayerId(viewerUserId))) {
      throw new NotFoundException('Media not found');
    }
    return media;
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
        // When it was filmed, as the player says — bounded to not-after-today
        // in the product's time zone, so it can be late but never ahead of the
        // upload. `createdAt` stays the server's own fact about the upload.
        recordedAt: parseRecordedAt(dto.recordedAt),
        rating: isAttribute ? dto.rating : null,
        title: dto.title ?? null,
        description: dto.description ?? null,
        // PROCESSING and UNVERIFIED, both by column default and never written
        // here. The first is the worker's to change once it has found the object
        // in the bucket (see MediaProcessor); the second is an admin's, and
        // nothing on the upload path may set it. A clip cannot be born public.
      },
    });

    /*
     * The operator hears about every new video, on Telegram.
     *
     * At confirm time rather than after the worker verifies the object,
     * because "somebody uploaded" is the pulse the operator asked to feel —
     * moderation state is a different question with its own screen. Only
     * videos: an IMAGE through this path is an avatar-adjacent still, not the
     * content the platform runs on. Not awaited; a queued alert must not slow
     * the upload confirmation it describes.
     */
    if (dto.type === 'VIDEO') {
      void this.adminAlerts.announce({
        kind: 'CLIP_UPLOADED',
        name: `${profile.firstName} ${profile.lastName}`.trim(),
        category: dto.category,
        title: dto.title ?? null,
      });
    }

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
    const job: FinaliseClipJob = {
      mediaId: media.id,
      storageKey: media.storageKey,
      posterKey: media.posterKey,
      playerId: profile.id,
    };

    /*
     * Which job, and why the answer is the client's word.
     *
     * A browser that compressed says so; anything else — an older client, a
     * device whose encoder refused, a request made by hand — goes to the
     * transcoder. Believing a false "yes" would publish an unoptimised original;
     * disbelieving a true one costs one re-encode. The asymmetry decides it.
     */
    const needsTranscode = !dto.optimised;

    try {
      await this.queue.add(needsTranscode ? TRANSCODE_CLIP_JOB : FINALISE_CLIP_JOB, job, {
        jobId: media.id,
        attempts: needsTranscode ? TRANSCODE_ATTEMPTS : FINALISE_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: needsTranscode ? TRANSCODE_BACKOFF_MS : FINALISE_BACKOFF_MS,
        },
      });
    } catch (error) {
      /*
       * No queue, so do it here.
       *
       * Redis being unreachable used to mean this row stayed at PROCESSING for
       * good: the file was in the bucket, the upload had worked, and the player
       * watched a clip that never appeared. An outage of the accelerator should
       * not cost the thing it was accelerating.
       *
       * Not awaited. Finalising can take a couple of seconds of bucket lookups
       * and the caller is a browser waiting on a confirm — the response says
       * "PROCESSING" either way, and the client already polls for the change.
       */
      /*
       * No queue. What happens next depends on whether the clip is already fit
       * to publish.
       *
       * An optimised clip is finalised inline, as before: Redis is an
       * accelerator, and an outage of it should not cost a player their upload.
       *
       * An unoptimised one is not finalised at all. Transcoding is minutes of
       * CPU and it does not belong in a web process — but more importantly,
       * finalising it would promote the *original* to ACTIVE and put a 40 MB
       * file in the feed, which is the exact outcome this whole path exists to
       * prevent. It stays PROCESSING, visible only to its uploader, until the
       * stale-processing sweep (MediaRecoveryService) finds it with no job
       * behind it and queues one.
       */
      this.logger.warn(`Media queue unavailable for ${media.id}: ${(error as Error).message}`);
      if (needsTranscode) {
        this.logger.error(
          `Clip ${media.id} needs transcoding and the queue is unreachable — it stays ` +
            'PROCESSING rather than publishing the unoptimised original; the sweep ' +
            'will queue it once Redis is back.',
        );
      } else {
        void this.finaliseInline(job);
      }
    }

    // No cache invalidation here: the clip is not visible to anyone but its
    // uploader yet, and now cannot be until a moderator verifies it — which is
    // where the public profile cache is cleared (ModerationService.verifyMedia).
    return toMediaResponse(media, this.storage);
  }

  /**
   * The worker's job, run in this process because there is no worker.
   *
   * Keeps the retry the queue would have given it, for the same reason the
   * queue had one: the browser's PUT to R2 and its confirm call here are two
   * requests, and on a slow connection the confirm can win. A single immediate
   * check would mark a perfectly good upload as absent.
   *
   * Fewer attempts over a shorter window than BullMQ's five across two minutes —
   * this is holding a timer in a web process rather than a worker slot, and a
   * clip still missing after half a minute is one the player will re-upload
   * long before a background retry would have helped.
   *
   * Swallows its own errors. Nothing is waiting on the result and the row is
   * already written; a failure here leaves the clip at PROCESSING, which is
   * exactly where it would have been with no fallback at all.
   */
  private async finaliseInline(job: FinaliseClipJob) {
    for (let attempt = 1; attempt <= INLINE_FINALISE_ATTEMPTS; attempt++) {
      try {
        const outcome = await this.finaliser.finalise(job);
        if (outcome !== 'NOT_ARRIVED') return;
      } catch (error) {
        this.logger.warn(`Inline finalise of ${job.mediaId} failed: ${(error as Error).message}`);
        return;
      }

      if (attempt < INLINE_FINALISE_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, INLINE_FINALISE_DELAY_MS));
      }
    }

    this.logger.warn(
      `Clip ${job.mediaId} had not reached storage after the inline retries; left PROCESSING`,
    );
  }

  /**
   * Clip metadata — never a playable address.
   *
   * Public on purpose: the ratings on this list are what draw the attribute bars,
   * so a guest looking at a profile still sees "pace 85, backed by a clip". The
   * footage itself is reachable only through the signed URL this builds, which is
   * minted per read for callers this method has already authorized.
   */
  async listForPlayer(playerId: string, dto: ListPlayerMediaDto = {}, viewerUserId?: string) {
    const { skip, take, page, pageSize } = toSkipTake(dto);

    /*
     * The owner sees their own clips at every stage; nobody else sees anything
     * but a verified one.
     *
     * Both halves matter. A clip is not evidence until the worker has found it in
     * the bucket *and* a moderator has watched it — but hiding it from the
     * uploader too would mean pressing upload and watching nothing appear, which
     * is indistinguishable from a failure and is the moment they upload it again.
     * So the owner is shown their own clip while it is processing, while it is
     * waiting for review, and after it was blocked, each labelled as what it is
     * (see MediaModerationStatus). This is the one endpoint where a clip that is
     * not public is returned at all, and it returns it only to the one account
     * that supplied it.
     */
    const owner = viewerUserId
      ? await this.prisma.playerProfile.findFirst({
          where: { id: playerId, userId: viewerUserId },
          select: { id: true },
        })
      : null;

    const where: Prisma.MediaWhereInput = {
      playerId,
      ...(owner ? OWN_MEDIA_WHERE : PUBLIC_MEDIA_WHERE),
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
      // The landing page, so guests: verified only, like everything else public.
      where: { ...PUBLIC_MEDIA_WHERE, player: { user: { isPrivate: false } } },
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
            // The uploader's picture, in the same query as the clip — the
            // landing page shows who the footage belongs to beside its cover.
            user: { select: { avatarKey: true } },
          },
        },
      },
    });

    return Promise.all(
      items.map(async ({ player: { user, ...player }, ...media }) => ({
        ...(await toMediaResponse(media, this.storage)),
        player: { ...player, avatarUrl: this.storage.publicUrlOrNull(user?.avatarKey) },
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
      --
      -- Not moderation-filtered, deliberately: this reads the viewer's *own*
      -- history to learn what they scout for, and a clip that was later blocked
      -- still tells us they were watching finishing clips. Nothing about the clip
      -- leaves the subquery — only a per-category proportion.
      LEFT JOIN (
        SELECT lm.category,
               COUNT(*)::float / NULLIF(SUM(COUNT(*)) OVER (), 0) AS affinity
        FROM "MediaLike" lk
        JOIN "Media" lm ON lm.id = lk."mediaId"
        WHERE lk."userId" = ${viewerUserId}
        GROUP BY lm.category
      ) aff ON aff.category = m.category
      -- The moderation gate, in the one query that cannot express it in Prisma.
      -- Kept alongside the ACTIVE check rather than folded into it: they are two
      -- different verdicts (the bytes arrived / a person watched them) and a
      -- reader of this SQL should see both being demanded.
      WHERE m.status = 'ACTIVE' AND m."moderationStatus" = 'VERIFIED'
        AND m.type = 'VIDEO' AND u."isPrivate" = false
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
      where: { ...PUBLIC_MEDIA_WHERE, type: 'VIDEO', player: { user: { isPrivate: false } } },
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
   * The rating is editable because a mistyped 8 for 80 otherwise strands the
   * player with a claim they cannot fix, and the clip evidencing it has not
   * changed. The category is editable for the same reason: a shooting clip
   * filed under "technique" is a wrong label on the right footage — see
   * UpdateMediaDto for the one rule that moves with it.
   */
  async update(userId: string, mediaId: string, dto: UpdateMediaDto) {
    const profile = await this.ownPlayerProfile(userId);
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.status === 'REMOVED') throw new NotFoundException('Clip not found');
    if (media.playerId !== profile.id) {
      throw new ForbiddenException('You can only edit your own clips');
    }
    // A blocked clip is a moderation decision, not a draft. Retitling one is
    // editing something a moderator has already ruled on, and the only thing
    // its owner can usefully do with it now is delete it.
    if (media.moderationStatus === 'BLOCKED') {
      throw new ForbiddenException('This clip was blocked by a moderator and cannot be edited');
    }
    /*
     * The category the clip will have after this edit, and what that means
     * for the rating: an attribute clip carries one, a highlights clip does
     * not. The rating rule is checked against the *next* category, so
     * "highlights → finishing, rated 70" is one valid request rather than two
     * that each fail.
     */
    const nextCategory = dto.category ?? media.category;
    const categoryChanged = nextCategory !== media.category;
    const nextIsAttribute = ATTRIBUTE_CATEGORIES.includes(nextCategory);
    if (dto.rating !== undefined && !nextIsAttribute) {
      throw new BadRequestException('Highlights are not evidence for a single attribute');
    }
    const nextRating = nextIsAttribute ? (dto.rating ?? media.rating) : null;
    if (nextIsAttribute && nextRating === null) {
      throw new BadRequestException('Rate the attribute this clip is evidence for');
    }

    const updated = await this.prisma.media.update({
      where: { id: mediaId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() || null } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(categoryChanged ? { category: nextCategory } : {}),
        // A player editing their own clip is making a claim again, even if a
        // coach had corrected it — so the source goes back to SELF and the
        // coach's number is kept in the revision trail rather than silently lost.
        // A re-filed clip is a new claim for the same reason: the coach's number
        // was about the attribute it used to argue for.
        ...(categoryChanged || dto.rating !== undefined
          ? { rating: nextRating, reportedBy: 'SELF' as const }
          : {}),
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

    // A coach is one of the roles that may never be served an unreviewed clip
    // (§9), and rating one would be judging footage nobody has cleared — so this
    // is the same 404 a coach would get from the feed, not a softer check.
    const media = await this.publicMedia(mediaId);
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

  /**
   * What a clip's rating was before each change, newest first.
   *
   * Gated like the clip itself. The revisions are a small leak on their own — a
   * number and a date — but they confirm that a clip with this id exists and has
   * been rated, which is exactly what an unreviewed clip must not confirm to
   * anyone but its owner.
   */
  async ratingHistory(mediaId: string, viewerUserId?: string) {
    await this.viewableMedia(mediaId, viewerUserId);

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

    /*
     * The row is kept and the objects are not.
     *
     * `REMOVED` is a soft delete on purpose — the rating history, the likes and
     * the views are a record of a claim that was once made, and dropping the row
     * would rewrite a chart retroactively. None of that needs the video, though,
     * and a clip of a child that stays in a bucket after its owner deleted it is
     * exactly what the privacy policy says does not happen.
     *
     * After the update, never before it: a failed write would otherwise leave a
     * live row pointing at a video that no longer exists. And it cannot fail the
     * request — the clip is already gone from the player's view, so throwing here
     * would report failure for something that succeeded and invite a retry that
     * has nothing left to delete. The orphan is logged with its key so it is
     * findable.
     */
    for (const key of [removed.storageKey, removed.posterKey].filter(Boolean) as string[]) {
      await this.storage.deleteObject(key).catch((error: Error) => {
        this.logger.warn(
          `Deleted clip ${mediaId} but could not remove "${key}": ${error.message}. The clip is ` +
            'gone from the profile; this object is orphaned in the bucket.',
        );
      });
    }

    await this.redis.del(RedisKeys.playerProfile(profile.id));
    return toMediaResponse(removed, this.storage);
  }

  async like(userId: string, mediaId: string) {
    // You cannot like what you cannot see. The check is here and not only in the
    // feed because a like is a POST with an id in it, and an id is guessable.
    await this.publicMedia(mediaId);

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
   * Counts one view, at most once per viewer per clip per day.
   *
   * ## The database enforces it, not a cache
   *
   * This used to claim a Redis key with a day's TTL and insert only if the claim
   * was fresh. The rule was right and the mechanism was not: `SET NX` against an
   * unreachable Redis returns "not fresh", so an outage stopped counting views
   * entirely and silently — and the opposite failure mode would have counted
   * every request instead. A counter should not have either property.
   *
   * The unique index on `(mediaId, viewerKey, viewDate)` says the same thing
   * where the rows are, so it holds when Redis is down, when there are several
   * API instances, and when two requests race. A repeat is refused by Postgres
   * rather than by a cache that had to be asked first.
   *
   * ## What a repeat costs now
   *
   * One insert that fails on the constraint. No Redis round trip at all, and no
   * second query — the previous shape read the media row *before* deduplicating,
   * so every re-watch paid for a lookup whose result was thrown away. A feed
   * unmounts and remounts a slide as it scrolls past, so that was not a rare
   * path.
   *
   * ## Why a view is still an event
   *
   * `MediaView` is one row per viewer per clip per *day*, not per lifetime, so
   * "watched on three separate days" is still answerable — which is what makes
   * it an event rather than a like. Re-watching within a day is the same view;
   * coming back tomorrow is a new one.
   */
  async recordView(mediaId: string, viewer: { userId?: string; ipAddress?: string }) {
    // The account when there is one, so the same person is counted once whatever
    // network they are on; the address otherwise, which is all a guest offers.
    const viewerKey = viewer.userId ?? (viewer.ipAddress ? `ip:${viewer.ipAddress}` : null);
    if (!viewerKey) return { recorded: false };

    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: { status: true, moderationStatus: true },
    });
    if (!isPubliclyVisible(media)) throw new NotFoundException('Media not found');

    try {
      await this.prisma.mediaView.create({
        data: { mediaId, userId: viewer.userId ?? null, viewerKey, viewDate: startOfUtcDay() },
      });
      return { recorded: true };
    } catch (error) {
      // P2002 is the constraint doing its job: already counted today. Anything
      // else is a real failure and belongs to the caller.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { recorded: false };
      }
      throw error;
    }
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
    /*
     * The owner is allowed the counts on their own clip whatever its state.
     *
     * Not a hole: the numbers are all zero while a clip is unreviewed, since
     * nothing else can reach it to like or watch it. It is here because the
     * player's own clip panel asks for engagement the moment a clip opens, and
     * a 404 on their own upload reads as "your video is broken" — which is the
     * opposite of what "waiting for review" is meant to communicate.
     */
    await this.viewableMedia(mediaId, userId);

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
    // Same gate as the like: an unreviewed clip accepts no interaction at all,
    // including from an account that guessed its id.
    await this.publicMedia(mediaId);

    return this.prisma.mediaComment.create({
      data: { mediaId, userId, body: dto.body },
    });
  }

  async listComments(mediaId: string, dto: ListMediaCommentsDto) {
    // Public route, so no viewer to make an exception for. An unreviewed clip has
    // no comments anyway — nothing can reach it to write one — and answering with
    // an empty page would still confirm the clip exists.
    await this.publicMedia(mediaId);

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
