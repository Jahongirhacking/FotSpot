import type { CoachAssessment, PlayerProfile } from '@/lib/api/types';

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

export interface Attribute {
  key: 'pace' | 'dribbling' | 'passing' | 'finishing' | 'physical' | 'technique';
  label: string;
  /** 0–100, or null when there is no input at all. */
  value: number | null;
  provenance: Provenance;
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

export function deriveAttributes(
  player: PlayerProfile,
  assessments: CoachAssessment[] = [],
): Attribute[] {
  const hasCoach = assessments.length > 0;

  const pace = coachAverage(assessments, ['speed']) ?? sprintScore(player.sprintTime);
  const technique =
    coachAverage(assessments, ['dribbling']) ?? jugglingScore(player.jugglingRecord);

  return [
    {
      key: 'pace',
      label: 'Pace',
      value: pace,
      provenance:
        hasCoach && coachAverage(assessments, ['speed']) !== null
          ? 'coach'
          : pace !== null
            ? 'self'
            : 'none',
    },
    {
      key: 'dribbling',
      label: 'Dribbling',
      value: coachAverage(assessments, ['dribbling']),
      provenance: coachAverage(assessments, ['dribbling']) !== null ? 'coach' : 'none',
    },
    {
      key: 'passing',
      label: 'Passing',
      value: coachAverage(assessments, ['passing', 'vision']),
      provenance: coachAverage(assessments, ['passing', 'vision']) !== null ? 'coach' : 'none',
    },
    {
      key: 'finishing',
      label: 'Finishing',
      value: coachAverage(assessments, ['finishing']),
      provenance: coachAverage(assessments, ['finishing']) !== null ? 'coach' : 'none',
    },
    {
      key: 'physical',
      label: 'Physical',
      value: coachAverage(assessments, ['physical']),
      provenance: coachAverage(assessments, ['physical']) !== null ? 'coach' : 'none',
    },
    {
      key: 'technique',
      label: 'Technique',
      value: technique,
      provenance:
        coachAverage(assessments, ['dribbling']) !== null
          ? 'coach'
          : technique !== null
            ? 'self'
            : 'none',
    },
  ];
}

/**
 * How complete the card is. Drives the progression nudge (§21.4) — progress is
 * always framed against the player's own past self, never against other children.
 */
export function cardCompletion(player: PlayerProfile, assessments: CoachAssessment[] = []) {
  const checks = [
    { label: 'Position picked', done: Boolean(player.primaryPosition) },
    { label: 'Playing style picked', done: Boolean(player.playingStyle) },
    { label: 'Region set', done: Boolean(player.region) },
    { label: 'Height & weight', done: Boolean(player.height && player.weight) },
    { label: 'At least one clip', done: (player.media?.length ?? 0) > 0 },
    { label: 'A coach has assessed you', done: assessments.length > 0 },
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
