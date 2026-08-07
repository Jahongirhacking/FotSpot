import * as Sentry from '@sentry/nextjs';

/**
 * Every failure in the app is one of two things.
 *
 * **`client`** — somebody did something and is owed an answer. They pressed
 * Save, they submitted a form, they invited a player. Something did not happen
 * that they expected to happen, and silence would leave them pressing the button
 * again. These are shown.
 *
 * **`background`** — the app asked a question on its own behalf. "Does this
 * coach have a review for this player?", "does this viewer follow them?", "how
 * many applicants are outstanding?" Nobody asked, nobody is waiting, and there
 * is nothing to do about the answer. These are recorded and never shown: a
 * failed probe rendered as a red toast tells a user their account is broken
 * when what happened is that a speculative request came back empty.
 *
 * The distinction is about *who asked*, not about the status code. A 403 on a
 * button press is a `client` error worth explaining; the identical 403 on a
 * background probe is noise.
 */
export type ErrorKind = 'client' | 'background';

/**
 * Defaults, and why they fall this way.
 *
 * A **mutation** is always `client`: mutations only run because somebody pressed
 * something.
 *
 * A **query** is `background` unless it says otherwise. A query is the app
 * asking, usually on mount, often for something the screen renders an empty
 * state for anyway — and TanStack Query retries it without being asked. Mark the
 * few that genuinely block a user with `meta: { errorKind: 'client' }`; that is
 * a decision worth making one screen at a time, rather than the default that
 * shouts about every speculative fetch.
 */
export const DEFAULT_QUERY_ERROR_KIND: ErrorKind = 'background';
export const DEFAULT_MUTATION_ERROR_KIND: ErrorKind = 'client';

/**
 * Record something the user must not be shown.
 *
 * Not swallowed — *recorded*. A background failure is still a failure, and the
 * one thing worse than a toast nobody can act on is a fault nobody can find. It
 * goes to Sentry with the query key attached, and to the console in development
 * so it is visible while somebody is working on the code that produced it.
 */
export function reportBackgroundError(error: unknown, context: { key?: unknown } = {}) {
  Sentry.captureException(error, {
    level: 'warning',
    tags: { errorKind: 'background' },
    extra: { queryKey: context.key },
  });

  if (process.env.NODE_ENV !== 'production') {
    console.warn('[background]', context.key ?? '', error);
  }
}

/**
 * Types `meta` on queries and mutations, so these are checked rather than being
 * strings somebody has to spell right.
 *
 * `success` is the other half of the same idea as `errorKind`. A primary action
 * — invite, add to squad, recommend, send for review — should say three things
 * in three different ways:
 *
 *   before  it is disabled, or replaced by the reason, so a press that cannot
 *           work is not offered in the first place
 *   failed  the API's own words, because the press got through anyway
 *   worked  a short confirmation, because a screen that changes quietly two
 *           scrolls down reads as a button that did nothing
 *
 * The first is per-button and lives in the screen. The last two live here, so no
 * screen has to remember either.
 */
declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { errorKind?: ErrorKind };
    mutationMeta: { errorKind?: ErrorKind; success?: string };
  }
}
