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
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
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
