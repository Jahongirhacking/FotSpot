/**
 * How long a scout waits after a coach turns their recommendation down.
 *
 * Three months is a season's worth of football. It is long enough that filing
 * the same player again means something has changed — a growth spurt, a run of
 * form, a move to a position that suits them — and short enough that a scout who
 * was early rather than wrong is not shut out of the player's whole year.
 *
 * The rejection binds the scout, not the player: the academy may look at that
 * player again the next morning, and any other scout may put them forward today.
 */
export const RECOMMENDATION_COOLDOWN_MONTHS = 3;

export function cooldownEndsAt(rejectedAt: Date): Date {
  const openAt = new Date(rejectedAt);
  openAt.setMonth(openAt.getMonth() + RECOMMENDATION_COOLDOWN_MONTHS);
  return openAt;
}
