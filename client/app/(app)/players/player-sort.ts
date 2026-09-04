import type { PlayerSort } from '@/lib/api/resources';

/**
 * What the players board is sorted by when the URL does not say.
 *
 * Stars, most first: the board is where a scout looks for talent, and the
 * question they arrive with is "who is worth watching", not "who signed up
 * last". Newest-first stays one selection away, and a URL that names a sort
 * keeps naming it.
 */
export const DEFAULT_PLAYER_SORT: PlayerSort = 'stars';

/**
 * The URL value for the API's own default, newest profile first.
 *
 * The API expresses "newest" by omitting `sort`, which is exactly what a URL
 * with no sort at all looks like — and that URL now means stars. So the choice
 * needs a name of its own on the client, and it is translated back to
 * "no sort" before the request.
 */
export const NEWEST_SORT = 'newest';

export type PlayerSortChoice = PlayerSort | typeof NEWEST_SORT;
export type SortOrder = 'asc' | 'desc';

/**
 * The direction each sort takes when none is given — the API's own defaults,
 * so the direction select shows what the list actually did.
 *
 * Stars rank highest-first (`PlayersService.searchByStars`); every column sort
 * runs ascending (`searchOrderBy`).
 */
export function defaultOrderFor(choice: string): SortOrder {
  return choice === 'stars' ? 'desc' : 'asc';
}

export interface ResolvedPlayerSort {
  /** What the sort select shows. */
  choice: PlayerSortChoice;
  /** What the direction select shows. */
  order: SortOrder;
  /** What the request carries. No `sort` asks the API for newest first. */
  api: { sort?: PlayerSort; order?: SortOrder };
}

/**
 * One reading of `?sort=&order=` for the page that fetches and the filters
 * that display, so the two can never disagree about what "no sort" means.
 *
 * An unknown sort is passed through untouched rather than replaced: the API
 * answers 400 to anything it does not offer, and a hand-edited URL should fail
 * loudly rather than quietly show a different ordering.
 */
export function resolvePlayerSort(params: {
  sort?: string | null;
  order?: string | null;
}): ResolvedPlayerSort {
  const choice = (params.sort || DEFAULT_PLAYER_SORT) as PlayerSortChoice;
  const explicit = params.order === 'asc' || params.order === 'desc' ? params.order : undefined;
  const order = explicit ?? defaultOrderFor(choice);

  if (choice === NEWEST_SORT) return { choice, order, api: {} };
  return { choice, order, api: { sort: choice, order } };
}
