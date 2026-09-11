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

/**
 * `coach` is a verified number — an assessment or a coach's rating of a clip.
 * `relative` is a moderator's rating of a clip, given in review: it stands
 * until a coach replaces it and weighs half. `self` survives only for the
 * legacy numbers a player typed into their profile (sprint time, juggling).
 */
export type Provenance = 'combine' | 'coach' | 'relative' | 'self' | 'none';

export type AttributeKey =
  'pace' | 'dribbling' | 'passing' | 'finishing' | 'physical' | 'technique' | 'goalkeeping';

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
  goalkeeping: 'GOALKEEPING',
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
 * When a clip's claim is dated: the day it was filmed, as the player says, or
 * the upload when they did not say. The bar and the chart read time this way
 * — a clip filmed in May and uploaded in September is a May claim.
 */
export function claimDate(clip: Media): string {
  return clip.recordedAt ?? clip.createdAt;
}

/**
 * Whether a clip's rating counts towards the bar.
 *
 * The same rule the API serves the public by: a moderator has verified it,
 * and the bytes are there — confirmed (ACTIVE) or still being optimised
 * (PROCESSING, which plays as the original until the optimised copy replaces
 * it under the same key). An unverified or blocked clip never moves a number,
 * even on the uploader's own card: the bar is what a scout is shown, and it
 * must not read higher for the owner than for everybody else. `moderationStatus`
 * is absent only on an older cached response, which the API already filtered.
 */
export function countsTowardsRating(clip: Media): boolean {
  return (
    clip.rating != null &&
    (clip.status === 'ACTIVE' || clip.status === 'PROCESSING') &&
    (clip.moderationStatus === undefined || clip.moderationStatus === 'VERIFIED')
  );
}

/** Oldest filmed first; the upload breaks a same-day tie. */
const byClaimDate = (a: Media, b: Media) =>
  Date.parse(claimDate(a)) - Date.parse(claimDate(b)) ||
  Date.parse(a.createdAt) - Date.parse(b.createdAt);

/**
 * A player's clips the way every tab lists them: by the day they were filmed,
 * newest first. The API serves them so; this keeps an optimistic insert in
 * its place.
 */
export function sortClipsNewestFilmed(clips: Media[]): Media[] {
  return [...clips].sort((a, b) => byClaimDate(b, a));
}

/**
 * Every rated, public clip for one attribute, oldest first by the day it was
 * filmed.
 *
 * Nothing is overwritten on upload, so this is the whole story — "pace 70 in
 * July, 85 in September" — and it is what the history chart draws. Removing a
 * clip steps the bar back to the one before it, which falls out of this
 * filter rather than needing bookkeeping.
 */
export function attributeHistory(clips: Media[], key: AttributeKey) {
  const category = ATTRIBUTE_CATEGORY[key];
  return clips
    .filter((clip) => clip.category === category && countsTowardsRating(clip))
    .sort(byClaimDate);
}

/**
 * The clip the bar currently shows: the newest **verified** one by the day it
 * was filmed, and only when no coach has rated this skill the newest of any
 * kind. A coach's older 30 stands over a moderator's newer 40 — the verified
 * number is the one a scout is shown.
 */
export function currentClaim(clips: Media[], key: AttributeKey): Media | null {
  const newestFirst = attributeHistory(clips, key).reverse();
  return newestFirst.find((clip) => clip.reportedBy === 'VERIFIED') ?? newestFirst[0] ?? null;
}

/** The pill's colours per source; its words come from the dictionary (`provenanceCopy`). */
export const PROVENANCE_META: Record<Provenance, { className: string }> = {
  combine: { className: 'bg-prov-combine/15 text-prov-combine' },
  coach: { className: 'bg-prov-coach/15 text-prov-coach' },
  relative: { className: 'bg-prov-self/15 text-prov-self' },
  self: { className: 'bg-prov-self/15 text-prov-self' },
  none: { className: 'bg-surface-3 text-muted' },
};

/** What the pill says, in the reader's language: the full name and the short form. */
export function provenanceCopy(
  provenance: Provenance,
  t: Dictionary,
): { label: string; short: string } {
  switch (provenance) {
    case 'combine':
      return { label: t.player.combineMeasured, short: t.player.measured };
    case 'coach':
      return { label: t.player.coachVerified, short: t.player.verifiedShort };
    case 'relative':
      return { label: t.player.relativeRated, short: t.player.relativeShort };
    case 'self':
      return { label: t.player.selfReported, short: t.player.selfShort };
    default:
      return { label: t.player.noDataYet, short: '—' };
  }
}

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
  /*
   * No coach source, and that is the honest state rather than an oversight.
   *
   * `CoachAssessment` scores speed, passing, vision, dribbling, finishing,
   * physical, leadership and discipline — all outfield. Nothing there measures
   * shot-stopping, so borrowing one of them would put a number on this bar that
   * was never about goalkeeping, and the card would call it coach-verified.
   *
   * An empty list makes `coachAverage` return null, so the bar falls through to
   * the player's own clip and renders as self-reported (§1.6). That is true
   * today, and it stays true until `CoachAssessment` gains a goalkeeping field —
   * at which point this becomes `coach: ['goalkeeping']` and nothing else moves.
   */
  goalkeeping: { label: 'Goalkeeping', coach: [] },
};

/**
 * Every bar, each from the strongest source available.
 *
 * Precedence is **coach assessment → clip → legacy self-reported number**, and
 * it is not arbitrary. A coach assessment is somebody else's judgement of the
 * player, which the platform treats as verified (§1.6). A clip's rating is
 * verified when a coach put it there and relative when a moderator did in
 * review — the card draws a relative number dashed to say a coach has not yet
 * confirmed it. Which clip stands for a skill is `currentClaim`'s rule: the
 * newest verified one, else the newest of any kind.
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
        // A clip carries who rated it: a coach, or a moderator in review. The
        // bar says which.
        value: claim.rating,
        provenance: claim.reportedBy === 'VERIFIED' ? ('coach' as const) : ('relative' as const),
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
export function cardCompletion(player: PlayerProfile, t: Dictionary, clipCount: number) {
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
   *
   * ## `clipCount` is passed in, not read off the player
   *
   * This used to check `player.media?.length`, and `/players/me` has never
   * embedded media — so the clip step could not be completed by uploading a
   * clip, only by never noticing. Embedding the list to fix it would ship every
   * clip on every profile read to answer one boolean, which is what paginating
   * them was meant to stop. The screen already holds the clips; it passes the
   * number.
   */
  const checks = [
    { label: t.player.checkPosition, done: Boolean(player.primaryPosition) },
    { label: t.player.checkStyle, done: Boolean(player.playingStyle) },
    { label: t.player.checkRegion, done: Boolean(player.region) },
    { label: t.player.checkMeasurements, done: Boolean(player.height && player.weight) },
    { label: t.player.checkClip, done: clipCount > 0 },
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
 * Attributes every player can evidence, whatever position they play.
 *
 * Goalkeeping is the exception and therefore the reason this list exists: a
 * striker has nothing to show for it and never will. Counting it in the
 * denominator would have capped every outfield card at four stars — a
 * regression they could not act on, caused by a category that is not about
 * them.
 */
const UNIVERSAL_ATTRIBUTES = ATTRIBUTE_KEYS.filter((key) => key !== 'goalkeeping');

/**
 * The denominator: the universal attributes at 100 each.
 *
 * A player carrying only coach ratings can reach it. One carrying only their own
 * claims cannot — those are halved, so a perfect self-assessment reaches half of
 * it and three stars. That gap is the point: the star row is meant to pull towards
 * "get a coach to assess me", not towards typing 100 into every bar.
 *
 * A keeper's goalkeeping evidence still counts *towards* the total — it is real
 * evidence — it simply is not required to reach five stars. The clamp below
 * absorbs the overflow that allows.
 */
const EVIDENCE_MAX = UNIVERSAL_ATTRIBUTES.length * 100;

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
   * value, a moderator's relative number halved. Per skill the clip that counts
   * is the one the board shows — the newest verified, else the newest of any
   * kind — and the newest assessment replaces older ones, because a rating that
   * never expires stops describing the player.
   *
   * A clip's rating lands on whichever side `reportedBy` says: once a coach has
   * put the number on that clip it is verified and counts in full. A coach's 60
   * must not be quietly halved as though a reviewer had guessed it.
   *
   * The two are added rather than one replacing the other, so a player with no
   * coach yet still has a filling star row and something to raise.
   */
  let relativeSum = 0;
  let coachSum = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const claim = currentClaim(clips, key);
    if (claim?.rating != null) {
      if (claim.reportedBy === 'VERIFIED') coachSum += claim.rating;
      else relativeSum += claim.rating;
    }

    // A formal assessment still counts, and wins the attribute when the clip's
    // number is only relative: it is a judgement of the player, not of one clip.
    const coach = latestCoachRating(assessments, SOURCES[key].coach);
    if (coach !== null && claim?.reportedBy !== 'VERIFIED') coachSum += coach;
  }

  // Half of every relative rating, the whole of every verified one. Clamped
  // because the numerator can exceed the denominator two ways: a card that is
  // both fully relative-rated and fully coach-rated, and a keeper whose
  // goalkeeping evidence counts without being required. Neither should show
  // more than five stars.
  const score = relativeSum / 2 + coachSum;
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
