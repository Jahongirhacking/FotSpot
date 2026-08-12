import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key the guard looks up by exact string via `Reflector`.
 *
 * Like `ROLES_KEY` and `IS_PUBLIC_KEY`, renaming this without updating
 * `ThrottleGuard` silently disables every per-route limit in the app — see
 * backend/CLAUDE.md §9.
 */
export const THROTTLE_KEY = 'throttle';

export interface ThrottleOptions {
  /** Requests allowed per window, per caller. */
  limit: number;
  /** Length of the window, in seconds. */
  windowSeconds: number;
}

/**
 * Overrides the global request limit for one route or controller.
 *
 * Reach for it in two situations, and ideally no others:
 *
 * - The handler is **expensive**. `/media/feed` runs a four-table ranking query
 *   with two aggregate sub-selects; a hundred of those a minute from one caller
 *   is a database problem, whatever the global limit says.
 * - The handler is **public and writes**. `POST /media/:id/view` takes no token
 *   and inserts a row, so the only thing standing between an anonymous script
 *   and unbounded table growth is this number.
 *
 * Everything else should inherit the global default. A per-route number that
 * merely restates the default is a number nobody will maintain.
 */
export const Throttle = (options: ThrottleOptions) => SetMetadata(THROTTLE_KEY, options);

/**
 * Exempts a route from request throttling entirely.
 *
 * Only for handlers that a signed-in client legitimately calls in bursts — the
 * notification poll behind the bell, for instance. Never put this on anything
 * unauthenticated.
 */
export const NoThrottle = () => SetMetadata(THROTTLE_KEY, false);
