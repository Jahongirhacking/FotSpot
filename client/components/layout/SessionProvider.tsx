'use client';

import * as React from 'react';
import { resolveActiveRole, sortRoles, type Role } from '@/lib/roles';

/**
 * Session context, seeded by the server layout.
 *
 * Deliberately a context rather than a Zustand store: this data is *server-provided
 * and immutable* for the request, so it has an owner in the tree. Zustand is for
 * client-only state with no server origin (client/CLAUDE.md §8) — the one mutable
 * bit here, the active role, is genuinely local UI state and lives in `useState`.
 */
export interface SessionValue {
  roles: Role[];
  activeRole: Role | null;
  onboarded: boolean;
  isAuthenticated: boolean;
  setActiveRole: (role: Role) => void;
  hasRole: (role: Role) => boolean;
}

const SessionContext = React.createContext<SessionValue | null>(null);

export interface SessionSeed {
  roles: string[];
  activeRole: string | null;
  onboarded: boolean;
}

export function SessionProvider({
  seed,
  children,
}: {
  seed: SessionSeed | null;
  children: React.ReactNode;
}) {
  const roles = React.useMemo(() => sortRoles(seed?.roles ?? []), [seed?.roles]);

  const [activeRole, setActiveRoleState] = React.useState<Role | null>(() =>
    resolveActiveRole(seed?.roles ?? [], seed?.activeRole ?? null),
  );

  const setActiveRole = React.useCallback((role: Role) => {
    // Optimistic: switching is a view change, so there is nothing to wait for
    // (README §1.2.3). Persist in the background for the next login.
    setActiveRoleState(role);
    void fetch('/api/auth/active-role', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
  }, []);

  const value = React.useMemo<SessionValue>(
    () => ({
      roles,
      activeRole,
      onboarded: seed?.onboarded ?? false,
      isAuthenticated: Boolean(seed),
      setActiveRole,
      hasRole: (role) => roles.includes(role),
    }),
    [roles, activeRole, seed, setActiveRole],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Throws outside a provider — a component reading a session it may not have is a bug. */
export function useSession(): SessionValue {
  const value = React.useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
