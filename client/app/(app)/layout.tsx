import { AppHeader } from '@/components/layout/AppHeader';
import { getSession } from '@/lib/session';
import { users } from '@/lib/api/resources';
import { initials } from '@/lib/utils';

/**
 * Authenticated shell. `proxy.ts` has already redirected unauthenticated traffic,
 * so this can assume a session without re-checking.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  // Guests reach these routes too (players, academies, trials are public), so a
  // missing session is normal here — not a reason to redirect.
  // Only for the avatar monogram; a failure must not blank the whole app.
  const me = session
    ? await users.me({ token: session.accessToken, cache: 'no-store' }).catch(() => null)
    : null;

  return (
    <>
      <AppHeader
        initials={initials(me?.firstName, me?.lastName)}
        avatarUrl={me?.avatarUrl ?? null}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="text-muted border-border mt-auto border-t px-4 py-6 text-center text-xs">
        FotSpot · Grassroots → Academy → Professional
      </footer>
    </>
  );
}
