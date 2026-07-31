import { NextResponse } from 'next/server';
import { writeOnboarded } from '@/lib/cookies';

/**
 * Records that the first-login question was answered.
 *
 * Separate from `/api/auth/active-role` because of the player path: choosing "I
 * play" answers the question but grants nothing yet — the `player` role arrives
 * with the profile, after the §11.1 age gate. Routing that through the active-role
 * endpoint would mean claiming a role the user does not hold, which that route
 * correctly refuses.
 */
export async function POST() {
  const response = NextResponse.json({ onboarded: true });
  writeOnboarded(response);
  return response;
}
