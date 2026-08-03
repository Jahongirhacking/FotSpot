export const THEME_STORAGE_KEY = 'fs_theme';

export type ThemeChoice = 'light' | 'dark' | 'system';

/**
 * Runs before first paint, straight from `<head>`.
 *
 * Without it the page renders in whatever the CSS defaults to and then snaps to
 * the chosen theme once React hydrates — a white flash on a dark-mode phone,
 * which on this app is somebody opening their player card at night.
 *
 * It only writes `data-theme` for an **explicit** choice. Left unset, the
 * `prefers-color-scheme` media query in globals.css takes over, so "system"
 * follows the OS live, with no listener and no JavaScript involved at all.
 *
 * Wrapped in try/catch because `localStorage` throws outright in Safari's private
 * mode, and a theme preference is not worth a blank page.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}})()`;

/** Fired after a change so every mounted toggle re-reads, in this tab. */
const THEME_EVENT = 'fs:theme';

/** Applies a choice immediately and remembers it. */
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = choice;
  }

  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage denied — the theme still applies for this page view.
  }

  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * Subscribes to theme changes for `useSyncExternalStore`.
 *
 * `storage` covers other tabs — change the theme on one and the rest follow,
 * which is what someone with the app open twice expects. The custom event covers
 * this tab, since `storage` deliberately does not fire in the tab that wrote it.
 */
export function subscribeToTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function readTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}
