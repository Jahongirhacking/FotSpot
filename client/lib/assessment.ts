/**
 * The eight columns a coach scores, in the order they read them.
 *
 * Shared because a coach writes numbers in two places and it is the same set
 * both times: the online review (clips and stats) and the verdict after testing
 * the player in person. The backend rejects a positive decision — an ACCEPT or a
 * PASS — that is missing any of them, so a screen offering seven sliders is a
 * form that cannot be submitted.
 *
 * Distinct from `AttributeKey` in `player-card.ts`, which is the six *bars* a
 * card renders. These are the raw columns of `CoachAssessment`; those are a
 * derived, public-facing summary, and conflating them is how a rename in one
 * silently breaks the other.
 */
export const ASSESSMENT_KEYS = [
  'speed',
  'dribbling',
  'passing',
  'finishing',
  'physical',
  'vision',
  'leadership',
  'discipline',
] as const;

export type AssessmentKey = (typeof ASSESSMENT_KEYS)[number];

export type AssessmentRatings = Record<AssessmentKey, number>;

/** Mid-scale, so a coach adjusts from a neutral start rather than from zero. */
export const DEFAULT_RATINGS = Object.fromEntries(
  ASSESSMENT_KEYS.map((key) => [key, 50]),
) as AssessmentRatings;

/**
 * The dictionary key that labels a column.
 *
 * `speed` is the one that differs: the assessment column is "speed" and the
 * attribute the product talks about is "pace". The rest line up.
 */
export function assessmentLabelKey(key: AssessmentKey) {
  return key === 'speed' ? ('pace' as const) : key;
}
