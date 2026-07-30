import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/layout/Providers';
import { getSession } from '@/lib/session';

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1117' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the session server-side so the shell renders with the correct role on the
  // first paint — no flash of the wrong dashboard (README §1.2.1).
  const session = await getSession();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers
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
