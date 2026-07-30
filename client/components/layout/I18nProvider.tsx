'use client';

import * as React from 'react';
import {
  DEFAULT_LOCALE,
  getDictionary,
  interpolate,
  type Dictionary,
  type Locale,
} from '@/lib/i18n';

interface I18nValue {
  locale: Locale;
  t: Dictionary;
  /** Fill `{name}` placeholders: `f(t.trials.ages, { min: 12, max: 14 })`. */
  f: (template: string, values?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = React.createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = React.useMemo<I18nValue>(
    () => ({
      locale,
      t: getDictionary(locale),
      f: interpolate,
      setLocale: (next: Locale) => {
        // A year-long cookie, then a full reload: every Server Component on the
        // page renders text too, so a client-side state flip would translate half
        // the screen and leave the rest in the old language.
        document.cookie = `fs_locale=${next}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
        window.location.reload();
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Translations inside Client Components. Server Components use `getServerT()`. */
export function useI18n(): I18nValue {
  const value = React.useContext(I18nContext);
  if (!value) {
    // A component rendered outside the provider still has to render *something*
    // readable, so fall back to the default locale rather than throwing.
    return {
      locale: DEFAULT_LOCALE,
      t: getDictionary(DEFAULT_LOCALE),
      f: interpolate,
      setLocale: () => undefined,
    };
  }
  return value;
}

/** Shorthand for the common case of only needing the dictionary. */
export function useT(): Dictionary {
  return useI18n().t;
}
