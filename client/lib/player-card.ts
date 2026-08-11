import type { CoachAssessment, Media, MediaCategory, PlayerProfile } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n';

/**
 * Player card attribute derivation — README §21.2.
 *
 * Six bars, each mapped to data the platform actually collects, each carrying its
 * provenance (§12.4). The Combine (§13.1) does not exist yet, so `combine` is never
 * currently the source — the mapping is written so that adding it later is a data
 * change, not a rewrite.
 *
 * Pure functions, no React: independently testable, and the same numbers can render
 * a card, a search row, or a future PNG export.
 */

export type Provenance = 'combine' | 'coach' | 'self' | 'none';

export type AttributeKey =
  'pace' | 'dribbling' | 'passing' | 'finishing' | 'physical' | 'technique';

/**
 * An attribute and the clip category that evidences it.
 *
 * One vocabulary, deliberately: a clip's category *is* the bar it argues for, so
 * "upload a pace clip" and "raise my pace bar" are the same action rather than two
 * that have to be kept in sync by hand.
 */
export const ATTRIBUTE_CATEGORY: Record<AttributeKey, MediaCategory> = {
  pace: 'PACE',
  dribbling: 'DRIBBLING',
  passing: 'PASSING',
  finishing: 'FINISHING',
  physical: 'PHYSICAL',
  technique: 'TECHNIQUE',
};

export const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTE_CATEGORY) as AttributeKey[];

export const CATEGORY_ATTRIBUTE = Object.fromEntries(
  ATTRIBUTE_KEYS.map((key) => [ATTRIBUTE_CATEGORY[key], key]),
) as Record<MediaCategory, AttributeKey | undefined>;

export interface Attribute {
  key: AttributeKey;
  label: string;
  /** 0–100, or null when there is no input at all. */
  value: number | null;
  provenance: Provenance;
  /** The clip backing a self-reported value, when one does. */
  evidence?: Media | null;
}

/**
 * Every claim the player has made for one attribute, oldest first.
 *
 * Nothing is overwritten on upload, so this is the whole story — "pace 70 in
 * July, 85 in September" — and it is what the history chart draws. Only ACTIVE
 * clips count: removing one steps the bar back to the claim before it, which
 * falls out of this filter rather than needing bookkeeping.
 */
export function attributeHistory(clips: Media[], key: AttributeKey) {
  const category = ATTRIBUTE_CATEGORY[key];
  return clips
    .filter((clip) => clip.category === category && clip.status === 'ACTIVE' && clip.rating != null)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** The newest claim — the one the bar currently shows. */
export function currentClaim(clips: Media[], key: AttributeKey): Media | null {
  const history = attributeHistory(clips, key);
  return history.length > 0 ? history[history.length - 1] : null;
}

export const PROVENANCE_META: Record<
  Provenance,
  { label: string; short: string; className: string }
> = {
  combine: {
    label: 'Combine-measured',
    short: 'Measured',
    className: 'bg-prov-combine/15 text-prov-combine',
  },
  coach: {
    label: 'Coach-verified',
    short: 'Verified',
    className: 'bg-prov-coach/15 text-prov-coach',
  },
  self: {
    label: 'Self-reported',
    short: 'Self',
    className: 'bg-prov-self/15 text-prov-self',
  },
  none: { label: 'No data yet', short: '—', className: 'bg-surface-3 text-muted' },
};

/** Average of the coach assessments provided, per 1–10 category, scaled to 0–100. */
function coachAverage(
  assessments: CoachAssessment[],
  keys: (keyof CoachAssessment)[],
): number | null {
  if (assessments.length === 0) return null;

  const values: number[] = [];
  for (const assessment of assessments) {
    for (const key of keys) {
      const raw = assessment[key];
      if (typeof raw === 'number') values.push(raw);
    }
  }
  if (values.length === 0) return null;

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(mean * 10);
}

/**
 * Sprint time → 0–100, normalised within an age band.
 *
 * Deliberately crude and clearly bounded: this is a self-reported number until the
 * Combine exists, and the card labels it as such. Faster is better, so the scale is
 * inverted.
 */
function sprintScore(sprintTime: number | null | undefined): number | null {
  if (!sprintTime) return null;
  const fastest = 3.8;
  const slowest = 7.0;
  const clamped = Math.min(Math.max(sprintTime, fastest), slowest);
  return Math.round(((slowest - clamped) / (slowest - fastest)) * 100);
}

function jugglingScore(record: number | null | undefined): number | null {
  if (!record) return null;
  // 200 touches is treated as the top of the scale; beyond that it stops
  // discriminating between players.
  return Math.round(Math.min(record / 200, 1) * 100);
}

/** Coach categories that feed each bar, and the legacy self-reported fallback. */
const SOURCES: Record<
  AttributeKey,
  { label: string; coach: (keyof CoachAssessment)[]; legacy?: (p: PlayerProfile) => number | null }
> = {
  pace: { label: 'Pace', coach: ['speed'], legacy: (p) => sprintScore(p.sprintTime) },
  dribbling: { label: 'Dribbling', coach: ['dribbling'] },
  passing: { label: 'Passing', coach: ['passing', 'vision'] },
  finishing: { label: 'Finishing', coach: ['finishing'] },
  physical: { label: 'Physical', coach: ['physical'] },
  technique: {
    label: 'Technique',
    coach: ['dribbling'],
    legacy: (p) => jugglingScore(p.jugglingRecord),
  },
};

/**
 * The six bars, each from the strongest source available.
 *
 * Precedence is **coach → clip → legacy self-reported number**, and it is not
 * arbitrary. A coach assessment is somebody else's judgement, which is the only
 * kind the platform treats as verified (§1.6). A clip-backed self-rating is the
 * player's own claim with evidence attached — better than a bare number because a
 * scout can watch it and disagree, but still self-reported, and the card draws it
 * dashed to say so. Attaching a video does not make a claim true, and a UI that
 * implied otherwise would hollow out the distinction the whole product rests on.
 *
 * `clips` defaults to the media embedded in the profile, so callers that already
 * have it (the public profile endpoint) need pass nothing.
 */
export function deriveAttributes(
  player: PlayerProfile,
  assessments: CoachAssessment[] = [],
  clips: Media[] = player.media ?? [],
): Attribute[] {
  return ATTRIBUTE_KEYS.map((key) => {
    const source = SOURCES[key];
    const coach = coachAverage(assessments, source.coach);
    if (coach !== null) {
      return { key, label: source.label, value: coach, provenance: 'coach' as const };
    }

    const claim = currentClaim(clips, key);
    if (claim?.rating != null) {
      return {
        key,
        label: source.label,
        // A clip carries who rated it: the player claimed a number, or a coach
        // watched the same clip and replaced it. The bar says which.
        value: claim.rating,
        provenance: claim.reportedBy === 'COACH' ? ('coach' as const) : ('self' as const),
        evidence: claim,
      };
    }

    const legacy = source.legacy?.(player) ?? null;
    return {
      key,
      label: source.label,
      value: legacy,
      provenance: legacy !== null ? ('self' as const) : ('none' as const),
    };
  });
}

/**
 * How complete the card is. Drives the progression nudge (§21.4) — progress is
 * always framed against the player's own past self, never against other children.
 */
export function cardCompletion(player: PlayerProfile, t: Dictionary) {
  /*
   * Only things the player can do themselves.
   *
   * "A coach has assessed you" used to sit at the bottom of this list, which made
   * the bar unfinishable by design: whether a coach ever writes an assessment is
   * somebody else's decision, arriving on somebody else's timetable, and a
   * checklist that ends on a step you cannot take reads as a chore you have
   * failed rather than one you have not done yet. Being assessed still matters —
   * it is what turns a claim into evidence (§1.6) — but it belongs in the panel
   * that explains verification, not in a progress bar about filling in a profile.
   */
  const checks = [
    { label: t.player.checkPosition, done: Boolean(player.primaryPosition) },
    { label: t.player.checkStyle, done: Boolean(player.playingStyle) },
    { label: t.player.checkRegion, done: Boolean(player.region) },
    { label: t.player.checkMeasurements, done: Boolean(player.height && player.weight) },
    { label: t.player.checkClip, done: (player.media?.length ?? 0) > 0 },
  ];

  const done = checks.filter((check) => check.done).length;
  return { checks, done, total: checks.length, percent: Math.round((done / checks.length) * 100) };
}

/** Position group, used to theme the card and to filter playing styles. */
export function positionGroup(position?: string | null) {
  if (!position) return 'Unknown' as const;
  if (position === 'GK') return 'Goalkeeper' as const;
  if (['CB', 'LB', 'RB'].includes(position)) return 'Defence' as const;
  if (['DM', 'CM', 'AM'].includes(position)) return 'Midfield' as const;
  return 'Forward' as const;
}

export type PositionGroup = ReturnType<typeof positionGroup>;

/**
 * Where each position sits on a vertical pitch, as percentages.
 *
 * `x` runs left→right, `y` runs from the player's own goal line (0) to the goal
 * they attack (100), so the map reads the way a team sheet is drawn.
 */
export const POSITION_COORDS: Record<string, { x: number; y: number }> = {
  GK: { x: 50, y: 8 },
  CB: { x: 50, y: 24 },
  LB: { x: 17, y: 28 },
  RB: { x: 83, y: 28 },
  DM: { x: 50, y: 40 },
  CM: { x: 50, y: 54 },
  AM: { x: 50, y: 67 },
  LW: { x: 16, y: 76 },
  RW: { x: 84, y: 76 },
  ST: { x: 50, y: 88 },
};

/**
 * How much of the card is backed by someone other than the player.
 *
 * ## This rates the evidence, not the child
 *
 * §21.5 forbids a composite rating on a player's card, and that rule is not
 * negotiated away by putting the number in a nicer shape. The stars below count
 * how many attributes a verified coach has signed off — a fact about how complete
 * the record is, identical for a gifted player and an average one with the same
 * paperwork.
 *
 * That distinction is also what makes it useful: it gives the card the collectable
 * feel a fourteen-year-old expects while pointing the ambition at "get a coach to
 * assess me", which is the one thing that actually improves their standing with an
 * academy (§1.6).
 */
export type EvidenceTier = 'unrated' | 'bronze' | 'silver' | 'gold';

export interface CardEvidence {
  tier: EvidenceTier;
  /** 0–5, for the star row along the bottom of the card. */
  stars: number;
  verifiedCount: number;
  total: number;
}

/**
 * The denominator: six attributes at 100 each.
 *
 * A player carrying only coach ratings can reach it. One carrying only their own
 * claims cannot — those are halved, so a perfect self-assessment reaches half of
 * it and three stars. That gap is the point: the star row is meant to pull towards
 * "get a coach to assess me", not towards typing 100 six times.
 */
const EVIDENCE_MAX = Object.keys(ATTRIBUTE_CATEGORY).length * 100;

/** The most recent value a coach put on this attribute, or null. */
function latestCoachRating(
  assessments: CoachAssessment[],
  keys: (keyof CoachAssessment)[],
): number | null {
  const newest = [...assessments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  for (const assessment of newest) {
    const values = keys
      .map((key) => assessment[key])
      .filter((value): value is number => typeof value === 'number');
    // Averaged only across the keys of one assessment — a card attribute can map
    // to two of a coach's, and those two were written in the same sitting.
    if (values.length) return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  return null;
}

/** Colour band for a star count. Presentation, so it stays on the client. */
export function starTier(stars: number): EvidenceTier {
  return stars === 0 ? 'unrated' : stars >= 5 ? 'gold' : stars >= 3 ? 'silver' : 'bronze';
}

export function cardEvidence(
  player: PlayerProfile,
  assessments: CoachAssessment[] = [],
  clips: Media[] = player.media ?? [],
): CardEvidence {
  const attributes = deriveAttributes(player, assessments, clips);
  const total = attributes.length;
  const verifiedCount = attributes.filter(
    (attribute) => attribute.provenance === 'coach' || attribute.provenance === 'combine',
  ).length;

  /*
   * Both kinds of rating count, at different weights: a coach's number at face
   * value, the player's own halved. The latest of each is what counts — a clip
   * uploaded today replaces the claim made last season, and so does the newest
   * assessment, because a rating that never expires stops describing the player.
   *
   * A clip's rating lands on whichever side `reportedBy` says: once a coach has
   * corrected the number on that clip, it stops being a claim and counts in full.
   * That is the whole point of letting them change it — a coach's 60 should not
   * be quietly halved as though the player had written it.
   *
   * The two are added rather than one replacing the other, so a player with no
   * coach yet still has a filling star row and something to raise.
   */
  let selfSum = 0;
  let coachSum = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const claim = currentClaim(clips, key);
    if (claim?.rating != null) {
      if (claim.reportedBy === 'COACH') coachSum += claim.rating;
      else selfSum += claim.rating;
    }

    // A formal assessment still counts, and wins the attribute when both exist:
    // it is a judgement of the player, not of one clip.
    const coach = latestCoachRating(assessments, SOURCES[key].coach);
    if (coach !== null && claim?.reportedBy !== 'COACH') coachSum += coach;
  }

  // Clamped because the two halves can exceed the denominator together — a fully
  // self-rated *and* fully coach-rated card scores 900 — and a card cannot show
  // seven stars.
  const score = selfSum / 2 + coachSum;
  const stars = Math.max(0, Math.min(5, Math.round((score / EVIDENCE_MAX) * 5)));

  const tier: EvidenceTier =
    stars === 0 ? 'unrated' : stars >= 5 ? 'gold' : stars >= 3 ? 'silver' : 'bronze';

  return { tier, stars, verifiedCount, total };
}

/**
 * Card theming per position group, in the eFootball idiom: a coloured foil behind
 * the player, with the position code and evidence tier reading at a glance.
 *
 * Plain CSS gradients rather than images — the target device is an entry-level
 * Android phone on mobile data (§14), and a card that costs 300 KB to look at is
 * one nobody scrolls through.
 */
export const CARD_THEME: Record<PositionGroup, { from: string; to: string; ring: string }> = {
  Goalkeeper: { from: '#f59e0b', to: '#78350f', ring: '#fbbf24' },
  Defence: { from: '#3b82f6', to: '#172554', ring: '#60a5fa' },
  Midfield: { from: '#10b981', to: '#022c22', ring: '#34d399' },
  Forward: { from: '#ef4444', to: '#450a0a', ring: '#f87171' },
  Unknown: { from: '#64748b', to: '#0f172a', ring: '#94a3b8' },
};
