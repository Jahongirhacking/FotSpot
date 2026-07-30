import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isRole } from '@/lib/roles';
import { writeActiveRole, writeOnboarded } from '@/lib/cookies';
import { ROLES_COOKIE } from '@/lib/session';

/**
 * Persists the active role (README §1.2.1) and, optionally, that onboarding is done.
 *
 * Note what this route does NOT do: it grants nothing. The active role is a view
 * preference, so the only validation needed is "is this a real role the user
 * holds" — and even if that check were bypassed, the backend guards still decide
 * every actual permission.
 */
export async function PUT(request: Request) {
  const { role, onboarded } = await request.json().catch(() => ({}));

  if (!isRole(role)) {
    return NextResponse.json({ message: 'Unknown role' }, { status: 400 });
  }

  const store = await cookies();
  const held = safeParseRoles(store.get(ROLES_COOKIE)?.value);
  if (!held.includes(role)) {
    return NextResponse.json({ message: "You don't hold that role" }, { status: 403 });
  }

  const response = NextResponse.json({ role });
  writeActiveRole(response, role);
  if (onboarded) writeOnboarded(response);
  return response;
}

function safeParseRoles(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
