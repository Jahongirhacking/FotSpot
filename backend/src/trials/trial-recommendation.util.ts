/**
 * Ordering trials for the player looking at them.
 *
 * Pure and DI-free (backend/CLAUDE.md §2), so the ranking can be asserted
 * without a database — which matters here because the interesting cases are
 * ties. A comparator is only correct in terms of what it does when two things
 * are *equal* on the first criterion, and that is exactly what a fixture can
 * state and a live query cannot.
 */

/** Mean Earth radius, in kilometres. */
const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two points, in kilometres.
 *
 * ## Why not subtract the coordinates
 *
 * A degree of latitude is about 111km everywhere; a degree of *longitude* is
 * 111km at the equator and shrinks to nothing at the poles. At Uzbekistan's
 * latitude (~41°N) it is about 84km — so treating the two axes as equal
 * overstates east–west distance by a third, and an academy 40km east would sort
 * as though it were 53km away. Haversine accounts for that, and for the fact
 * that the shortest path is an arc rather than a line on a flat sheet.
 *
 * Returns `null` when either point is incomplete. Half a coordinate pair points
 * at the Gulf of Guinea, and a confident wrong number is worse here than an
 * admitted unknown — an academy that has not said where it is should sort last
 * among equals, not first because its distance computed as zero.
 */
export function distanceKm(
  from: { latitude?: number | null; longitude?: number | null },
  to: { latitude?: number | null; longitude?: number | null },
): number | null {
  if (
    typeof from?.latitude !== 'number' ||
    typeof from?.longitude !== 'number' ||
    typeof to?.latitude !== 'number' ||
    typeof to?.longitude !== 'number'
  ) {
    return null;
  }

  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** What the ranking knows about the player doing the looking. */
export interface ViewerProfile {
  age: number | null;
  positions: string[];
  latitude?: number | null;
  longitude?: number | null;
}

/** What it knows about a trial. */
export interface RankableTrial {
  ageRangeMin: number | null;
  ageRangeMax: number | null;
  positions: string[];
  createdAt: Date;
  academy?: { latitude?: number | null; longitude?: number | null } | null;
}

/** Whether the player's age falls inside the trial's stated range. */
export function matchesAge(trial: RankableTrial, age: number | null): boolean {
  // A trial that states no range is open on age, so nobody is excluded — but
  // nobody is specially matched either. Treated as a match: it *is* open to them.
  if (trial.ageRangeMin === null || trial.ageRangeMax === null) return true;
  if (age === null) return false;
  return age >= trial.ageRangeMin && age <= trial.ageRangeMax;
}

/** Whether the trial wants a position this player actually plays. */
export function matchesPosition(trial: RankableTrial, positions: string[]): boolean {
  if (trial.positions.length === 0) return true;
  if (positions.length === 0) return false;
  return trial.positions.some((wanted) => positions.includes(wanted));
}

/**
 * The recommended order: age, then position, then distance, then newest.
 *
 * ## Strictly in that order, and why it is a cascade rather than a score
 *
 * A weighted score would let a very close academy outrank one the player is
 * actually eligible for, which is the opposite of useful — a trial you cannot
 * apply to is worth nothing however near it is. So each criterion is only
 * consulted when everything above it has tied, which is what "prioritise in
 * exactly this order" means.
 *
 * ## Where an unknown distance sorts
 *
 * Last among its tier. An academy with no coordinates has said nothing about
 * where it is, and guessing zero would promote it above every academy that
 * *did* say — rewarding the missing data.
 *
 * The final tie-break is newest, so the order is total: two trials that match
 * equally and sit equally far away still have a stable, meaningful order rather
 * than whatever the database returned.
 */
export function compareRecommended(
  a: RankableTrial,
  b: RankableTrial,
  viewer: ViewerProfile,
): number {
  // 1. Age.
  const ageA = matchesAge(a, viewer.age);
  const ageB = matchesAge(b, viewer.age);
  if (ageA !== ageB) return ageA ? -1 : 1;

  // 2. Position.
  const posA = matchesPosition(a, viewer.positions);
  const posB = matchesPosition(b, viewer.positions);
  if (posA !== posB) return posA ? -1 : 1;

  // 3. Distance, nearest first, unknown last.
  const distA = distanceKm(viewer, a.academy ?? {});
  const distB = distanceKm(viewer, b.academy ?? {});
  if (distA !== distB) {
    if (distA === null) return 1;
    if (distB === null) return -1;
    return distA - distB;
  }

  // 4. Newest.
  return b.createdAt.getTime() - a.createdAt.getTime();
}

/**
 * The default order: newest first.
 *
 * `createdAt`, not the trial's own date — "newly published" is when the academy
 * announced it, which is what a player refreshing the board is looking for. An
 * open-ended trial has no date at all and would otherwise have no place in the
 * order.
 */
export function compareNewest(a: RankableTrial, b: RankableTrial): number {
  return b.createdAt.getTime() - a.createdAt.getTime();
}
