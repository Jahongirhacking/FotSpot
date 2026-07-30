import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { auth } from '@/lib/api/resources';
import type { DeviceSession } from '@/lib/api/types';
import { ROLE_META, type Role } from '@/lib/roles';
import { SessionList } from './SessionList';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/settings');

  const devices = await auth
    .sessions({ token: session.accessToken, cache: 'no-store' })
    .catch(() => [] as DeviceSession[]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Your roles</CardTitle>
          <CardDescription>
            You can hold several at once. Switching between them changes what you see, never what
            you&apos;re allowed to do.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {session.roles.map((role) => {
            const meta = ROLE_META[role as Role];
            if (!meta) return null;
            const isActive = role === session.activeRole;
            return (
              <Badge key={role} variant={isActive ? 'primary' : 'outline'}>
                {meta.label}
                {isActive ? ' · active' : ''}
              </Badge>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where you&apos;re signed in</CardTitle>
          <CardDescription>
            Each device gets its own session. Signing out of one leaves the others alone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SessionList devices={devices} currentSessionId={null} />
        </CardContent>
      </Card>
    </div>
  );
}
