import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './config';
import { getDictionary, interpolate } from './index';

/**
 * Locale for the current request, for Server Components.
 *
 * The visitor's own choice, or Uzbek. `Accept-Language` used to get a vote, and
 * that is why the site opened in English for almost everybody: `en` is one of the
 * three locales, and every desktop browser and most phones send `en-US` first
 * whatever their owner actually reads.
 *
 * This is a product for Uzbek footballers and their families, so Uzbek is what an
 * unrecognised visitor gets, and the language picker sits in the header of every
 * page — signed in or out — for the people who want something else. One tap beats
 * a guess made from a header nobody set deliberately.
 *
 * NOTE (Next 16): `cookies()` is async.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const chosen = store.get(LOCALE_COOKIE)?.value;
  return isLocale(chosen) ? chosen : DEFAULT_LOCALE;
}

/** Dictionary + interpolator for a Server Component. */
export async function getServerT() {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale), f: interpolate };
}
