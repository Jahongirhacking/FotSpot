import { cookies } from 'next/headers';
import { ACTIVE_ROLE_COOKIE, resolveActiveRole, type Role } from '@/lib/roles';

/**
 * Server-side session access.
 *
 * NOTE (Next 16): `cookies()` is async — synchronous access was removed. Every
 * helper here is therefore async too.
 */

export const ACCESS_COOKIE = 'fs_access';
export const REFRESH_COOKIE = 'fs_refresh';
export const ROLES_COOKIE = 'fs_roles';
export const ONBOARDED_COOKIE = 'fs_onboarded';

export interface ServerSession {
  accessToken: string;
  roles: string[];
  activeRole: Role | null;
  onboarded: boolean;
}

export async function getSession(): Promise<ServerSession | null> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;

  const roles = parseRoles(store.get(ROLES_COOKIE)?.value);

  return {
    accessToken,
    roles,
    // Stored role is a preference, validated against roles actually held (§1.2.1).
    activeRole: resolveActiveRole(roles, store.get(ACTIVE_ROLE_COOKIE)?.value),
    onboarded: store.get(ONBOARDED_COOKIE)?.value === '1',
  };
}

export async function requireSession(): Promise<ServerSession> {
  const session = await getSession();
  if (!session) {
    // proxy.ts redirects unauthenticated traffic before a page renders, so reaching
    // here means a cookie expired mid-render rather than an unguarded route.
    throw new Error('No session');
  }
  return session;
}

function parseRoles(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return value.split(',').filter(Boolean);
  }
}
