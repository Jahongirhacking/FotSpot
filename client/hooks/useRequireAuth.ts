'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from '@/components/layout/SessionProvider';

/**
 * Gate for actions a guest may see but not perform.
 *
 * Browsing is open (README §1.2: guests view public players, academies, media and
 * search). Only the *actions* — follow, like, recommend, apply — need an account,
 * so the login prompt belongs on the action, not on the page. Returns false and
 * sends the user to login, preserving where they were so they come back to it.
 */
export function useRequireAuth() {
  const { isAuthenticated } = useSession();
  const pathname = usePathname();

  return React.useCallback(() => {
    if (isAuthenticated) return true;
    window.location.assign(`/login?next=${encodeURIComponent(pathname)}`);
    return false;
  }, [isAuthenticated, pathname]);
}
