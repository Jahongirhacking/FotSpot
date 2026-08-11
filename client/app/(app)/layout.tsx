import { AppHeader } from '@/components/layout/AppHeader';
import { users } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { initials } from '@/lib/utils';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

/** Reachable while `mustChangePassword` is set — the password screen itself, and
 *  the way out. Anything else redirects. */
const ALLOWED_WHILE_LOCKED = ['/settings/password'];

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

  /*
   * An admin-generated password is a shared secret by construction — the admin who
   * created the account knows it, and it travelled through whatever chat app they
   * pasted it into. So it is a key to get in once, not a password: the account is
   * held on the change-password screen until it has been replaced.
   *
   * `x-pathname` is set by proxy.ts; without it this would redirect the password
   * screen to itself. If the header is somehow missing, nothing is enforced rather
   * than everything being trapped in a loop.
   */
  const pathname = (await headers()).get('x-pathname');
  if (me?.mustChangePassword && pathname && !ALLOWED_WHILE_LOCKED.includes(pathname)) {
    redirect('/settings/password');
  }

  /*
   * A brand-new account holds no role until it answers the first-login question
   * (§1.2.2), and every screen in here is keyed to a role — the dashboard would
   * render nothing and the nav would be empty. So there is exactly one place to
   * go, and this sends it there rather than showing an app that does not work.
   *
   * /welcome lives outside this layout, so it stays reachable.
   */
  if (session && me && me.roles.length === 0) {
    redirect('/welcome');
  }

  return (
    <>
      <AppHeader
        initials={initials(me?.firstName, me?.lastName)}
        avatarUrl={me?.avatarUrl ?? null}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="text-muted border-border mt-auto border-t px-4 py-6 text-center text-xs">
        FotSpot · Grassroots → Academy
      </footer>
    </>
  );
}
