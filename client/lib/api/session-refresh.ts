'use client';

/**
 * Re-mint the session after the backend grants or revokes a role.
 *
 * WHY THIS IS NEEDED: `roles` is a claim baked into the JWT at login/refresh
 * (backend/CLAUDE.md §7 documents this as an accepted staleness window, and
 * explicitly rules out hitting the database on every request to avoid it). So
 * creating a player profile grants `player` in the database, but the caller's
 * existing token — and the `fs_roles` cookie derived from it — still say
 * `["scout"]`. The new role stays invisible until the token is renewed, which is
 * why a freshly created player card didn't appear in the role switcher.
 *
 * Call this after any action that changes the caller's own roles. It is the
 * narrow fix the staleness window was designed to have: renew on the few writes
 * that matter, rather than re-reading roles on every request.
 */
export async function refreshSession(): Promise<string[] | null> {
  const response = await fetch('/api/auth/refresh', { method: 'POST' });
  if (!response.ok) return null;

  const body = (await response.json().catch(() => ({}))) as { roles?: string[] };
  return body.roles ?? null;
}

/** Persist the active role, for use straight after `refreshSession()`. */
export async function setActiveRoleCookie(role: string): Promise<void> {
  await fetch('/api/auth/active-role', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  }).catch(() => undefined);
}
