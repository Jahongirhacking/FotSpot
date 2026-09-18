/**
 * How many scouts a player's recommendation card shows before "load more".
 *
 * Shared by the server page, which fetches the first page with the profile,
 * and the card, which fetches the rest — the two must agree or the second page
 * starts in the middle of the first. A plain module so the server component
 * can import it without crossing into client code.
 */
export const RECOMMENDATION_PAGE_SIZE = 3;
