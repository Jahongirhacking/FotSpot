import { applyTheme, type ThemeChoice } from './theme';

/**
 * The theme switch, as a circle growing out of the button that was pressed.
 *
 * ## How it stays cheap
 *
 * The View Transition API does the work: the browser snapshots the page as it
 * is, `applyTheme` flips `data-theme` synchronously, the browser snapshots the
 * page as it now is, and the only thing animated is a `clip-path` on the new
 * snapshot — one compositor-driven property on one layer, no React state, no
 * per-frame JavaScript, no second copy of the DOM. The page underneath is not
 * touched again until the circle has covered it.
 *
 * ## When it does not run
 *
 * A browser without `startViewTransition` (Firefox before 144), a reader who
 * asked for reduced motion, or a switch that does not change what is on
 * screen (system → dark on a dark system) all get the plain, instant switch.
 * The stored choice and `data-theme` end up exactly as `applyTheme` leaves
 * them either way, so the head script that prevents a flash on load is
 * unaffected.
 */

export type Point = { x: number; y: number };

/** The radius that reaches the farthest corner of a viewport from `origin`. */
export function revealRadius(origin: Point, viewport: { width: number; height: number }): number {
  return Math.hypot(
    Math.max(origin.x, viewport.width - origin.x),
    Math.max(origin.y, viewport.height - origin.y),
  );
}

/** What the reader would see for a choice, given the system preference. */
export function effectiveTheme(choice: ThemeChoice, systemDark: boolean): 'light' | 'dark' {
  if (choice === 'system') return systemDark ? 'dark' : 'light';
  return choice;
}

const REVEAL_CLASS = 'theme-reveal';
const DURATION_MS = 520;

export function revealTheme(choice: ThemeChoice, origin: Point) {
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const current = root.dataset.theme as ThemeChoice | undefined;
  const before = effectiveTheme(current ?? 'system', systemDark);
  const after = effectiveTheme(choice, systemDark);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supported = typeof document.startViewTransition === 'function';
  if (!supported || reduceMotion || before === after) {
    applyTheme(choice);
    return;
  }

  const radius = revealRadius(origin, { width: window.innerWidth, height: window.innerHeight });
  root.classList.add(REVEAL_CLASS);
  const transition = document.startViewTransition(() => applyTheme(choice));

  transition.ready
    .then(() => {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${origin.x}px ${origin.y}px)`,
            `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
          ],
        },
        {
          duration: DURATION_MS,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    .catch(() => undefined);

  void transition.finished.finally(() => root.classList.remove(REVEAL_CLASS));
}
