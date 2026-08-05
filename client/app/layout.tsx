import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/layout/Providers';
import { getSession } from '@/lib/session';
import { getLocale } from '@/lib/i18n/server';
import { THEME_SCRIPT } from '@/lib/theme';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'FotSpot — get seen',
    template: '%s · FotSpot',
  },
  description:
    'Grassroots to academy football in Uzbekistan. Build your player card, get discovered by academies, and apply for trials.',
};

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
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers
          locale={locale}
          session={
            session
              ? {
                  roles: session.roles,
                  activeRole: session.activeRole,
                  onboarded: session.onboarded,
                }
              : null
          }
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
