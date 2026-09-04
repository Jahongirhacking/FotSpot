import { Providers } from '@/components/layout/Providers';
import { PlayingStyleModalController } from '@/components/player/PlayingStyleModalController';
import type { Locale } from '@/lib/i18n/config';
import { getLocale, getServerT } from '@/lib/i18n/server';
import { jsonLd, siteUrl } from '@/lib/seo';
import { siteGraphLd } from '@/lib/structured-data';
import { getSession } from '@/lib/session';
import { THEME_SCRIPT } from '@/lib/theme';
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Script from 'next/script';
import { Suspense } from 'react';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

/** What OpenGraph wants, which is not what an `html lang` wants. */
const OG_LOCALE: Record<Locale, string> = { uz: 'uz_UZ', ru: 'ru_RU', en: 'en_US' };

/**
 * Site-wide metadata, in the reader's language.
 *
 * A function rather than a constant because the title and description are
 * translated (§14) and a static export cannot read the locale cookie. Uzbek is
 * what an unrecognised visitor gets — see lib/i18n/config.ts for why that is the
 * default rather than English — so that is also what a crawler indexes and what
 * an unopened link previews as.
 *
 * `metadataBase` is what makes every relative canonical and social image on every
 * page resolve to an absolute URL — without it Next emits relative ones, which
 * crawlers ignore and social scrapers cannot fetch.
 *
 * Deliberately **no `alternates.languages`**. hreflang points at a *different URL*
 * per language, and this app has one URL per page with the locale in a cookie
 * (config.ts explains that trade). Emitting hreflang here would tell a crawler
 * that three addresses exist when only one does, which is worse than saying
 * nothing.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getServerT();

  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: t.seo.title,
      // The brand stays untranslated — it is a name, not a word.
      template: '%s · FotSpot',
    },
    description: t.seo.description,
    applicationName: 'FotSpot',
    keywords: t.seo.keywords,
    /*
     * No `alternates` and no `openGraph.url` here — deliberately.
     *
     * Next merges metadata shallowly, so a layout-level canonical of `/` was
     * inherited by every page that did not set its own, and those pages told
     * Google they were duplicates of the homepage. Each page now declares its
     * canonical through `pageMetadata` (lib/seo.ts); the layout supplies only
     * what is genuinely site-wide.
     */
    // A plain path: `app/favicon.ico` would emit `/favicon.ico?favicon.<hash>`,
    // a URL variant Search Console then reports as a discovered page.
    icons: { icon: '/favicon.ico' },
    openGraph: {
      type: 'website',
      siteName: 'FotSpot',
      title: t.seo.title,
      description: t.seo.description,
      locale: OG_LOCALE[locale],
      images: [
        {
          url: '/fotspot.png',
          width: 600,
          height: 600,
          alt: 'FotSpot',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: t.seo.title,
      description: t.seo.description,
      images: ['/fotspot.png'],
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  // Draws behind the notch and the home indicator instead of letterboxing the
  // page; globals.css then pads the shell by the insets, and the bottom sheet
  // clears the indicator.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    // The floodlit-pitch background, so the phone's status bar joins the page
    // instead of sitting on it as a grey strip.
    { media: '(prefers-color-scheme: dark)', color: '#0b1512' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the session server-side so the shell renders with the correct role on the
  // first paint — no flash of the wrong dashboard (README §1.2.1).
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const { t } = await getServerT();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The head script below sets `data-theme` before React sees the document,
      // so the server-rendered html tag and the hydrated one legitimately differ.
      suppressHydrationWarning
    >
      <head>
        {/*
          Blocking on purpose, and first. Deferring it means one frame of the
          wrong theme — a white flash for anyone opening the app at night, which
          is most of when a teenager looks at their card.

          `dangerouslySetInnerHTML` is the only way to emit an inline script from
          JSX, and it is safe *here* for a reason worth stating: THEME_SCRIPT is a
          module-level constant with no interpolation and no input of any kind —
          see lib/theme.ts, which documents that invariant. Sanitising it would be
          worse than pointless: an HTML sanitiser strips script bodies, so the
          theme would stop applying and the white flash would come back.

          `suppressHydrationWarning` because this node is a favourite target for
          browser extensions, which rewrite its `src` or empty its contents before
          React hydrates. That mismatch is the extension's, not ours, and React
          cannot tell the difference.
        */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-F9HZSNS42B"
          strategy="afterInteractive"
        />

        <Script id="google-analytics" strategy="afterInteractive">
          {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', 'G-F9HZSNS42B');
        `}
        </Script>

        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />

        {/*
          Who FotSpot is, on every page rather than only the landing one.

          A knowledge panel is built from the *site*, not the page, and a crawler
          that meets this only at `/` has to reach `/` first — where most arrivals
          land on a player, an academy or a trial. It costs a few hundred bytes.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLd(siteGraphLd(t.seo.description))}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers
          locale={locale}
          session={
            session
              ? {
                  roles: session?.roles,
                  activeRole: session?.activeRole,
                  onboarded: session?.onboarded,
                }
              : null
          }
        >
          {children}

          {/*
            Mounted here rather than in `(app)/layout.tsx` so it genuinely works
            "from any page": the landing page, /privacy and the auth screens are
            outside that group, and `/?showPlayingStyle=PLAYMAKER` is one of the
            cases this has to handle.

            `Suspense` is not optional. `useSearchParams` opts a subtree into
            client-side rendering, and without a boundary it would drag every
            statically rendered page with it — Next fails the build rather than
            let that happen quietly. The fallback is nothing, because a closed
            modal looks like nothing.
          */}
          <Suspense fallback={null}>
            <PlayingStyleModalController />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
