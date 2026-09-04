import type { DominantFoot, Prisma } from '@prisma/client';

/**
 * What a dominant-foot filter admits.
 *
 * `BOTH` is not a third foot. A two-footed player is a left-footed player *and*
 * a right-footed one, so a scout asking for left-footers must be shown them —
 * treating the enum as three mutually exclusive boxes hid every two-footed
 * player from both of the searches they belong in. Asking for `BOTH` itself is
 * the narrow question ("who is genuinely two-footed?") and stays exact.
 *
 * | filter | admits        |
 * |--------|---------------|
 * | LEFT   | LEFT, BOTH    |
 * | RIGHT  | RIGHT, BOTH   |
 * | BOTH   | BOTH          |
 *
 * A `where` fragment rather than a post-filter, so the count, the page and the
 * stars ranking all ask the database the same question.
 */
export function dominantFootWhere(
  filter: DominantFoot,
): Prisma.PlayerProfileWhereInput['dominantFoot'] {
  return filter === 'BOTH' ? 'BOTH' : { in: [filter, 'BOTH'] };
}
