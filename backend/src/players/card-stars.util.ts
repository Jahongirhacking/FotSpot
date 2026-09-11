/**
 * The star row on a player card — the one number the card shows about a player.
 *
 * ## What it counts
 *
 * Every attribute the card tracks contributes its **latest** rating: a clip
 * uploaded today replaces the claim made last season, and the newest assessment
 * replaces an older one, because a rating that never expires stops describing
 * the player.
 *
 * A coach's number counts in full; a moderator's relative number counts for
 * half. That gap is the point — a card full of relative ratings reaches two and
 * a half stars and only a coach can fill the rest, so the row pulls towards
 * "get a coach to assess me" rather than towards what a reviewer saw in one clip.
 *
 * A clip carries who rated it (`reportedBy`). Per attribute the card shows the
 * newest **verified** clip by the day it was filmed, and only when no coach has
 * rated that skill does the newest clip of any kind stand in — the same rule
 * the skill board draws by. A formal assessment wins the attribute when both
 * exist: it judges the player, not one clip.
 *
 * ## Where it lives
 *
 * Here, not in the client. Every surface that draws a card — the profile, search
 * results, a dashboard, the feed — was otherwise fetching a player's assessments
 * purely to recompute the same five stars, which is a request per card on a
 * screen that shows twenty of them.
 *
 * Pure and DI-free so it can be tested without a database (backend/CLAUDE.md §2).
 */

/** The six attributes a card shows, and the assessment columns behind each. */
export const CARD_ATTRIBUTES = {
  PACE: ['speed'],
  DRIBBLING: ['dribbling'],
  PASSING: ['passing', 'vision'],
  FINISHING: ['finishing'],
  PHYSICAL: ['physical'],
  TECHNIQUE: ['dribbling', 'vision'],
} as const satisfies Record<string, readonly string[]>;

export type CardAttribute = keyof typeof CARD_ATTRIBUTES;

/** Six attributes at 100 each — reachable on coach ratings alone. */
export const STARS_MAX_SCORE = 600;
export const STARS = 5;

export interface StarClip {
  category: string;
  rating: number | null;
  /** Who put the number there: a coach (verified) or a moderator (relative). */
  reportedBy: 'VERIFIED' | 'RELATIVE';
  /** The day it was filmed — what "newest" means for a rating. */
  recordedAt?: Date | string | null;
  createdAt: Date | string;
}

export interface StarAssessment {
  createdAt: Date | string;
  [column: string]: unknown;
}

const time = (value: Date | string) => new Date(value).getTime();

/** When the clip was filmed, or uploaded for a row that does not say. */
const filmedAt = (clip: StarClip) => time(clip.recordedAt ?? clip.createdAt);

/**
 * The clip whose rating stands for this attribute: the newest verified one by
 * the day it was filmed, else the newest of any kind. A coach's older 30 beats
 * a moderator's newer 40 — the verified number is the one a scout is shown.
 */
export function currentClip(clips: StarClip[], attribute: string): StarClip | null {
  const rated = clips
    .filter((clip) => clip.category === attribute && clip.rating != null)
    .sort((a, b) => filmedAt(b) - filmedAt(a) || time(b.createdAt) - time(a.createdAt));
  return rated.find((clip) => clip.reportedBy === 'VERIFIED') ?? rated[0] ?? null;
}

/** The most recent value a coach put on this attribute in a formal assessment. */
function latestAssessed(assessments: StarAssessment[], columns: readonly string[]): number | null {
  const newest = [...assessments].sort((a, b) => time(b.createdAt) - time(a.createdAt));

  for (const assessment of newest) {
    const values = columns
      .map((column) => assessment[column])
      .filter((value): value is number => typeof value === 'number');
    // Averaged only within one assessment — a card attribute can map to two of a
    // coach's columns, and those two were written in the same sitting.
    if (values.length) return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  return null;
}

/**
 * Rounds to the nearest half star, halves rounding up: 1.25 → 1.5, 1.2 → 1,
 * 0.3 → 0.5, 0.2 → 0, 4.4 → 4.5. The row draws half stars, so a card can say
 * "three and a half" rather than rounding a whole star away.
 */
export function roundToNearestHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * 0–5 in halves. `sum / (attributes × 100)` scaled to five stars and rounded
 * to the nearest half; clamped, since the two halves can exceed the
 * denominator together.
 */
export function computeCardStars(clips: StarClip[] = [], assessments: StarAssessment[] = []) {
  let relativeSum = 0;
  let coachSum = 0;

  for (const attribute of Object.keys(CARD_ATTRIBUTES) as CardAttribute[]) {
    const clip = currentClip(clips, attribute);
    if (clip?.rating != null) {
      if (clip.reportedBy === 'VERIFIED') coachSum += clip.rating;
      else relativeSum += clip.rating;
    }

    // A formal assessment still counts, and wins the attribute when the clip's
    // number is only relative: it is a judgement of the player, not of one clip.
    if (clip?.reportedBy !== 'VERIFIED') {
      const assessed = latestAssessed(assessments, CARD_ATTRIBUTES[attribute]);
      if (assessed !== null) coachSum += assessed;
    }
  }

  // Half of every relative rating, the whole of every verified one.
  const score = relativeSum / 2 + coachSum;
  const raw = (score / STARS_MAX_SCORE) * STARS;
  return Math.max(0, Math.min(STARS, roundToNearestHalf(raw)));
}
