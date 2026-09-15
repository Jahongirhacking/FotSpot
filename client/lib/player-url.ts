/**
 * A player page's address, and what is and is not part of it.
 *
 * ## One identity, one URL
 *
 * A player is reachable by handle (`/players/@aziz`) and by id; the handle is
 * the canonical form when there is one, because it is what people share. A
 * query string is never part of the identity: `?showPlayingStyle=` opens a
 * modal over the same page and `?page=` pages a list. Search Console was
 * discovering `/players/<id>?showPlayingStyle=OFFENSIVE_KEEPER` as pages of
 * their own — one per style per player — because the style strip rendered
 * them as crawlable links. The canonical, the sitemap and every internal
 * link are built here, from the player alone, so none of them can carry a
 * view parameter.
 */

/** The parameter the playing-style modal reads. UI state, not content. */
export const PLAYING_STYLE_PARAM = 'showPlayingStyle';

/** Query parameters that only change what is *shown* over a page, never which page it is. */
export const UI_ONLY_PARAMS = [PLAYING_STYLE_PARAM] as const;

/** The canonical path of a player's page — the handle when there is one, the id otherwise. */
export function playerPath(player: { id: string; username?: string | null }): string {
  return player.username ? `/players/@${player.username}` : `/players/${player.id}`;
}

/**
 * Whether a request's query carries only view state, so the page it renders
 * is the canonical page with something opened over it — indexable as itself,
 * never as a second document. Any *other* parameter is left to the page.
 */
export function hasUiOnlyQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): boolean {
  if (!searchParams) return false;
  return UI_ONLY_PARAMS.some((param) => searchParams[param] !== undefined);
}
