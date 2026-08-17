/**
 * The day a view belongs to.
 *
 * UTC everywhere, not the viewer's zone. Two people watching the same clip at
 * the same moment from Tashkent and London must land in the same bucket, or the
 * "one view per day" rule would mean something different depending on where the
 * viewer stood — and the bucket is half of a unique constraint, so a
 * zone-dependent answer would let one person hold two of them.
 *
 * Midnight, because the column is a `DATE`: Postgres would truncate anyway, and
 * doing it here means the value written and the value compared are the same one
 * rather than two that agree by luck.
 *
 * DI-free and takes its clock as an argument so a test can ask for a specific
 * day without waiting for one — see `scout-level.util.ts` for the same pattern.
 */
export function startOfUtcDay(at: Date = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}
