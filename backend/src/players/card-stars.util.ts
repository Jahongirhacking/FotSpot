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
 * A coach's number counts in full; the player's own counts for half. That gap is
 * the point — a perfect self-assessment reaches three stars and only a coach can
 * fill the last two, so the row pulls towards "get a coach to assess me" rather
 * than towards typing 100 six times.
 *
 * A clip carries who rated it (`reportedBy`), so a coach who corrected a clip's
 * number counts on the coach side. A formal assessment wins the attribute when
 * both exist: it judges the player, not one clip.
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
  reportedBy: 'SELF' | 'COACH';
  createdAt: Date | string;
}

export interface StarAssessment {
  createdAt: Date | string;
  [column: string]: unknown;
}

const time = (value: Date | string) => new Date(value).getTime();

/** The newest clip carrying a rating for this attribute. */
function latestClip(clips: StarClip[], attribute: CardAttribute): StarClip | null {
  const matching = clips
    .filter((clip) => clip.category === attribute && clip.rating != null)
    .sort((a, b) => time(a.createdAt) - time(b.createdAt));
  return matching.length ? matching[matching.length - 1] : null;
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

/** 0–5, rounded. Clamped: the two halves can exceed the denominator together. */
export function computeCardStars(clips: StarClip[] = [], assessments: StarAssessment[] = []) {
  let selfSum = 0;
  let coachSum = 0;

  for (const attribute of Object.keys(CARD_ATTRIBUTES) as CardAttribute[]) {
    const clip = latestClip(clips, attribute);
    if (clip?.rating != null) {
      if (clip.reportedBy === 'COACH') coachSum += clip.rating;
      else selfSum += clip.rating;
    }

    if (clip?.reportedBy !== 'COACH') {
      const assessed = latestAssessed(assessments, CARD_ATTRIBUTES[attribute]);
      if (assessed !== null) coachSum += assessed;
    }
  }

  const score = selfSum / 2 + coachSum;
  return Math.max(0, Math.min(STARS, Math.round((score / STARS_MAX_SCORE) * STARS)));
}
