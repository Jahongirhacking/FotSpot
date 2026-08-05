/**
 * Localisation — README §14.
 *
 * Uzbek (Latin) is the default, not English: the product is for players in
 * Uzbekistan, and a status shown in English is a status not read. English exists
 * for the development team and for foreign academies.
 *
 * Deliberately NOT next-intl or a locale path segment: `/uz/players/…` would
 * fragment every URL, break the links already shipped, and force a routing
 * rewrite. The locale lives in a cookie, so a URL identifies a page and nothing
 * else — which also means a shared link opens in the reader's own language.
 */
export const LOCALES = ['uz', 'ru', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'uz';

export const LOCALE_META: Record<Locale, { label: string; englishLabel: string; flag: string }> = {
  uz: { label: "O'zbekcha", englishLabel: 'Uzbek', flag: '🇺🇿' },
  ru: { label: 'Русский', englishLabel: 'Russian', flag: '🇷🇺' },
  en: { label: 'English', englishLabel: 'English', flag: '🇬🇧' },
};

export const LOCALE_COOKIE = 'fs_locale';

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
