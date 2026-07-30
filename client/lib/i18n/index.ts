import { DEFAULT_LOCALE, type Locale } from './config';
import { uz, type Dictionary } from './dictionaries/uz';
import { ru } from './dictionaries/ru';
import { en } from './dictionaries/en';

export const DICTIONARIES: Record<Locale, Dictionary> = { uz, ru, en };

export type { Dictionary };
export * from './config';

/**
 * Dictionary for a locale. Statically imported rather than dynamically loaded:
 * three dictionaries are a few kilobytes, and a dynamic import would mean a
 * loading state on the very first paint of every page.
 */
export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/**
 * Substitutes `{name}` placeholders.
 *
 * Deliberately not a full ICU implementation: the strings that need real
 * pluralisation are few, and Russian's plural rules (1 / 2-4 / 5+) can't be faked
 * with a naive `s` suffix — those strings are phrased to avoid the problem instead.
 */
export function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );
}
