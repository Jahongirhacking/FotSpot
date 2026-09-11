import { createHash } from 'node:crypto';

/**
 * The feed's ranking, written once in TypeScript so it can be read and tested.
 *
 * The database does the actual ordering (`MediaService.feed` builds the same
 * expression in SQL, term for term, from the constants below); this file is
 * the specification of that expression. A test here that says "a fresh,
 * well-liked clip outranks an old one that merely has views" is a statement
 * about the SQL, because both are the same arithmetic on the same inputs.
 *
 * ## What changed, and why
 *
 * The previous score was three parts scout-earned weight, a little lifetime
 * likes, and a freshness term that faded within a week. For a new account —
 * nobody followed, nothing liked, nothing watched — that left one dominant
 * input: how much scouts had ever staked on the player, a number that only
 * ever grows. So the feed opened, for everybody, on the same old clips of the
 * same well-backed players, which had also collected the most views over the
 * years. Views were never in the formula, but they were what the reader saw.
 *
 * This version is built the way short-video feeds are built now, with the
 * inputs this platform actually has:
 *
 * - **Fresh content gets its chance**: a strong term that is worth the most on
 *   the day of upload and has faded to nothing within a couple of weeks.
 * - **Recent engagement beats lifetime engagement**: likes and views in the
 *   last seven days are a term of their own, weighted above lifetime likes.
 * - **Engagement rate beats raw views**: likes per view (smoothed so a clip
 *   with three likes and two views is not "150%") is scored; raw views only
 *   ever appear in a denominator or under a heavy log.
 * - **Lifetime counts are a weak signal**: they still say "this was good",
 *   they just cannot pin a clip to the top for a year.
 * - **Who you follow still leads**: a followed player's unseen clip is the
 *   strongest positive term, as before.
 * - **Exploration**: a per-session random term and a small lift for clips few
 *   people have seen, so two readers do not get the identical page and a new
 *   upload from an unknown player gets tested on somebody.
 * - **Diversification**: a player's second and third clips on one page are
 *   pushed down, so a page is six players rather than one.
 *
 * Personalisation grows with history: the follow, affinity and seen/liked
 * terms are zero for a brand-new account and come to dominate as it acts.
 *
 * ## Why every input is "as of `since`"
 *
 * Pages are fetched one at a time with an offset, and the reader's own actions
 * — watching page one — change the score of what they watched. If the score
 * moved between page one and page two, items would shift across the boundary:
 * a clip already shown could come back, another could be skipped. So a feed
 * session carries a timestamp, and every count, penalty and the set of
 * candidates itself is taken as of that moment. The next visit is a new
 * session and sees everything that happened since.
 */

const DAY = 24 * 60 * 60;

/** Weights, in rough order of how much they move a new account's feed. */
export const FEED_SCORE = {
  /** Worth this much on the hour of upload; see FRESH_DECAY_SECONDS. */
  FRESH_TERM: 3,
  /** e-folding time of the freshness term: 4 days ≈ 2.8-day half-life, ~0 after two weeks. */
  FRESH_DECAY_SECONDS: 4 * DAY,
  /** Likes and views in the last seven days, damped. */
  VELOCITY_TERM: 1.5,
  /** A view is a fraction of a like in the velocity term. */
  VIEW_AS_LIKE: 0.25,
  RECENT_WINDOW_SECONDS: 7 * DAY,
  /** Likes per view, smoothed. */
  RATE_TERM: 2,
  /** Views added to the denominator, so a handful of likes on no views is not a perfect rate. */
  RATE_PRIOR_VIEWS: 10,
  /** Lifetime likes, damped and weak. */
  LIFETIME_LIKES_TERM: 0.5,
  /** Scout-earned weight, damped — leads no longer, but still counts. */
  EARNED_TERM: 2,
  /** How many people follow the player. */
  POPULARITY_TERM: 0.8,
  /** Following the player at all. */
  FOLLOW_TERM: 2,
  /** ...and this clip of theirs is still unwatched. */
  FOLLOWED_UNSEEN_TERM: 2.5,
  /** Share of the viewer's likes in this clip's category. */
  AFFINITY_TERM: 1.8,
  /** Per-session noise in [0, 1). */
  EXPLORE_TERM: 1,
  /** A clip almost nobody has seen yet gets tested. */
  UNDER_EXPOSED_TERM: 0.8,
  /** Views at which the under-exposed lift has decayed by e. */
  UNDER_EXPOSED_VIEWS: 40,
  /**
   * Watched within the last hour: fully suppressed, then decaying. Larger
   * than every positive term a realistic clip can collect at once (a fresh,
   * well-liked, well-followed clip from a followed, well-backed player sums
   * to roughly 25), so a clip just watched never opens the feed.
   */
  SEEN_PENALTY: 30,
  SEEN_COOLDOWN_SECONDS: 60 * 60,
  SEEN_DECAY_SECONDS: 7 * DAY,
  /** Liked: decided, and it stays decided. */
  LIKED_PENALTY: 40,
  /** Each further clip of the same player on the page costs this much, up to DIVERSITY_MAX_STEPS. */
  DIVERSITY_PENALTY: 0.7,
  DIVERSITY_MAX_STEPS: 3,
} as const;

/** Everything the score reads about one clip, for one viewer, as of `since`. */
export interface FeedScoreInput {
  mediaId: string;
  /** Seconds since upload, as of `since`. */
  ageSeconds: number;
  likes: number;
  views: number;
  likesRecent: number;
  viewsRecent: number;
  globalWeight: number;
  followers: number;
  following: boolean;
  /** Share (0–1) of the viewer's likes that fell in this clip's category. */
  affinity: number;
  /** Seconds since the viewer last watched it, or null if never. */
  seenSecondsAgo: number | null;
  likedByViewer: boolean;
  /** The session's seed, so the noise is stable across its pages. */
  seed: string;
}

/**
 * The per-session noise for one clip, in [0, 1).
 *
 * The first 32 bits of `md5(mediaId || seed)`, read as a signed integer and
 * shifted into the unit interval — exactly what the SQL computes with
 * `('x' || substr(md5(...), 1, 8))::bit(32)::int`, so a value asserted here is
 * the value the database uses. Stable for a session, different across them.
 */
export function explorationNoise(mediaId: string, seed: string): number {
  const hex = createHash('md5')
    .update(mediaId + seed)
    .digest('hex')
    .slice(0, 8);
  const signed = parseInt(hex, 16) | 0; // int32, like Postgres's ::bit(32)::int
  return signed / 4294967296 + 0.5;
}

/** The base score, before the per-page diversity step. */
export function feedScore(input: FeedScoreInput): number {
  const w = FEED_SCORE;
  const fresh = w.FRESH_TERM * Math.exp(-Math.max(0, input.ageSeconds) / w.FRESH_DECAY_SECONDS);
  const velocity =
    w.VELOCITY_TERM * Math.log(1 + input.likesRecent + w.VIEW_AS_LIKE * input.viewsRecent);
  const rate = w.RATE_TERM * Math.min(1, input.likes / (input.views + w.RATE_PRIOR_VIEWS));
  const lifetime = w.LIFETIME_LIKES_TERM * Math.log(1 + input.likes);
  const earned = w.EARNED_TERM * Math.log(1 + Math.max(0, input.globalWeight));
  const popularity = w.POPULARITY_TERM * Math.log(1 + input.followers);
  const follow = input.following ? w.FOLLOW_TERM : 0;
  const followedUnseen =
    input.following && input.seenSecondsAgo === null ? w.FOLLOWED_UNSEEN_TERM : 0;
  const affinity = w.AFFINITY_TERM * input.affinity;
  const explore = w.EXPLORE_TERM * explorationNoise(input.mediaId, input.seed);
  const underExposed = w.UNDER_EXPOSED_TERM * Math.exp(-input.views / w.UNDER_EXPOSED_VIEWS);

  let seen = 0;
  if (input.seenSecondsAgo !== null) {
    seen =
      input.seenSecondsAgo < w.SEEN_COOLDOWN_SECONDS
        ? w.SEEN_PENALTY
        : w.SEEN_PENALTY *
          Math.exp(-(input.seenSecondsAgo - w.SEEN_COOLDOWN_SECONDS) / w.SEEN_DECAY_SECONDS);
  }
  const liked = input.likedByViewer ? w.LIKED_PENALTY : 0;

  return (
    fresh +
    velocity +
    rate +
    lifetime +
    earned +
    popularity +
    follow +
    followedUnseen +
    affinity +
    explore +
    underExposed -
    seen -
    liked
  );
}

/**
 * The per-page diversification: a player's second clip on the page loses a
 * step, the third two, and so on up to the cap. `rankWithinPlayer` is 1 for the
 * player's best-scored clip.
 */
export function diversityPenalty(rankWithinPlayer: number): number {
  const steps = Math.min(Math.max(0, rankWithinPlayer - 1), FEED_SCORE.DIVERSITY_MAX_STEPS);
  return FEED_SCORE.DIVERSITY_PENALTY * steps;
}

/**
 * Orders a candidate set the way the database does: base score, then the
 * diversity step within each player, then the final sort. Used by the tests to
 * check whole pages rather than single numbers; the SQL is the production path.
 */
export function rankFeed<T extends FeedScoreInput & { playerId: string }>(candidates: T[]): T[] {
  const scored = candidates.map((c) => ({ c, score: feedScore(c) }));
  const perPlayer = new Map<string, number>();
  const withRank = [...scored]
    .sort((a, b) => b.score - a.score || b.c.mediaId.localeCompare(a.c.mediaId))
    .map((row) => {
      const rank = (perPlayer.get(row.c.playerId) ?? 0) + 1;
      perPlayer.set(row.c.playerId, rank);
      return { ...row, final: row.score - diversityPenalty(rank) };
    });
  return withRank
    .sort((a, b) => b.final - a.final || b.c.mediaId.localeCompare(a.c.mediaId))
    .map((row) => row.c);
}
