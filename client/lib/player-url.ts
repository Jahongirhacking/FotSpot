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
/** A clip open in its viewer — on a player's page and in the feed. */
export const CLIP_PARAM = 'clip';
/** An academy photograph open in the lightbox. */
export const PHOTO_PARAM = 'photo';
/** A professional player's card open over the directory or an academy. */
export const PRO_PLAYER_PARAM = 'player';
/** A trial's participants drawer open beside a list. */
export const TRIAL_PARAM = 'trial';

/**
 * Query parameters that only change what is *shown* over a page, never which
 * page it is — every modal that lives in the URL is registered here. The
 * list does two jobs: `useModalParam` clears the others when it opens one, so
 * two dialogs are never told to open at once, and `hasUiOnlyQuery` marks a
 * URL carrying any of them `noindex`.
 */
export const UI_ONLY_PARAMS = [
  PLAYING_STYLE_PARAM,
  CLIP_PARAM,
  PHOTO_PARAM,
  PRO_PLAYER_PARAM,
  TRIAL_PARAM,
] as const;

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
