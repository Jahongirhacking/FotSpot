import type { Prisma } from '@prisma/client';
import type { PlayerSort } from './dto/player.dto';

/**
 * How a page of search results is ordered.
 *
 * Pure and DI-free like `scout-level.util.ts`, so the whole table below is
 * testable without a database — which matters more than it looks, because an
 * ordering bug does not throw. It returns rows, in the wrong order, and the only
 * thing that catches it is somebody noticing.
 *
 * ## Every ordering here is a column
 *
 * That is the constraint the list of sorts was chosen against, not a coincidence.
 * `skip`/`take` are applied by the database, so the sort has to be applied by the
 * database too — ranking a page after fetching it means page 2 is drawn from a
 * different ordering than page 1, and a player can appear on both or on neither.
 * `MediaService.feed` documents the same trap at length, which is why the feed is
 * raw SQL rather than a Prisma window ranked in memory.
 *
 * ## The tiebreak is not decorative
 *
 * Every ordering ends with `createdAt desc`. Names collide, ages collide by the
 * thousand, and most players share a weight of zero — without a total order,
 * Postgres is free to return equal rows in any order it likes, and it does not
 * promise the same one twice. That is the other way pagination silently breaks:
 * the sort looks right on page 1 and duplicates a row on page 2.
 */

/** What the endpoint has always done, and still does when nothing is asked for. */
const NEWEST_FIRST: Prisma.PlayerProfileOrderByWithRelationInput[] = [{ createdAt: 'desc' }];

export function searchOrderBy(
  sort: PlayerSort | undefined,
  order: 'asc' | 'desc' = 'asc',
): Prisma.PlayerProfileOrderByWithRelationInput[] {
  switch (sort) {
    case 'name':
      return [{ firstName: order }, { lastName: order }, { createdAt: 'desc' }];

    /*
     * Age ascending means youngest first, so the date order is inverted.
     *
     * Age is stored as a birth date, and the later the date the younger the
     * player. Ordering the column directly would put "sort by age, ascending" in
     * charge of listing the oldest — which is the reading nobody has, and the
     * kind of wrong that looks plausible enough to ship.
     */
    case 'age':
      return [{ birthDate: order === 'asc' ? 'desc' : 'asc' }, { createdAt: 'desc' }];

    /*
     * How many scouts have put this player forward.
     *
     * ## Why the count and not §1.5's earned weight
     *
     * `PlayerRecommendationWeight.globalWeight` is the better number — it is the
     * platform's own answer to "who is worth watching", weighted by the level of
     * the scout who staked it. It cannot be ordered by here, and the reason is
     * worth writing down because it is not obvious.
     *
     * The weight lives in a separate row that only exists once somebody has been
     * recommended, so ordering by it makes Prisma LEFT JOIN and every
     * never-recommended player arrives as NULL. Postgres treats NULL as larger
     * than any value, so `DESC` puts them **first** — "most recommended" would
     * open with the players nobody has recommended at all. `nulls: 'last'` is not
     * available either: Prisma only offers it on optional fields, and
     * `globalWeight` is `Float @default(0)`.
     *
     * `_count` over the recommendations relation has no such hole — a player with
     * none counts zero rather than null — so it sorts correctly in both
     * directions with no migration. Fixing this properly means guaranteeing a
     * weight row per player, at which point this becomes `globalWeight`.
     */
    case 'recommendations':
      return [{ recommendations: { _count: order } }, { createdAt: 'desc' }];

    default:
      return NEWEST_FIRST;
  }
}
