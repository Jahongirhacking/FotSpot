import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from './config';
import { getDictionary, interpolate } from './index';

/**
 * Locale for the current request, for Server Components.
 *
 * Order: explicit cookie choice, then Accept-Language, then Uzbek. Note that
 * `cookies()` and `headers()` are async in Next 16.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const chosen = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  const headerList = await headers();
  return negotiateLocale(headerList.get('accept-language')) ?? DEFAULT_LOCALE;
}

/** Dictionary + interpolator for a Server Component. */
export async function getServerT() {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale), f: interpolate };
}
