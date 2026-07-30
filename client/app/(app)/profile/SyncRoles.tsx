'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { refreshSession } from '@/lib/api/session-refresh';
import { useSession } from '@/components/layout/SessionProvider';

/**
 * Self-heals a session whose role claims have fallen behind the database.
 *
 * `authoritativeRoles` comes from the API, which reads the database; the session
 * comes from the JWT, which is a snapshot from login time. If a role was granted
 * mid-session — creating a player card, an admin verifying a coach — the two
 * disagree and the switcher is missing an entry.
 *
 * Renewing on the granting action (see `refreshSession`) handles the common path.
 * This covers everyone whose session already went stale before that fix existed,
 * so they don't have to work out that signing out is the remedy.
 */
export function SyncRoles({ authoritativeRoles }: { authoritativeRoles: string[] }) {
  const { roles } = useSession();
  const router = useRouter();
  const attempted = React.useRef(false);

  const sessionRoles = React.useMemo(() => [...roles].sort().join(','), [roles]);
  const trueRoles = React.useMemo(
    () => [...authoritativeRoles].sort().join(','),
    [authoritativeRoles],
  );

  React.useEffect(() => {
    // Once per mount: a failed refresh must not become a reload loop.
    if (attempted.current || sessionRoles === trueRoles) return;
    attempted.current = true;

    void refreshSession().then((updated) => {
      if (updated) router.refresh();
    });
  }, [sessionRoles, trueRoles, router]);

  return null;
}
