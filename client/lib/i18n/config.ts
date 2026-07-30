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

/**
 * Best locale for a first-time visitor with no cookie yet.
 *
 * Falls back to Uzbek rather than to the browser's first choice: an Uzbek user
 * whose phone is set to Russian is still better served by Uzbek than by English,
 * and only an explicit ru/en preference should move them off the default.
 */
export function negotiateLocale(acceptLanguage?: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: tag.toLowerCase().split('-')[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    if (isLocale(tag)) return tag;
  }
  return DEFAULT_LOCALE;
}
