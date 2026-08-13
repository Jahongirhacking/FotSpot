import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { auth, users } from '@/lib/api/resources';
import type { DeviceSession } from '@/lib/api/types';
import { ROLE_META, type Role } from '@/lib/roles';
import { SessionList } from './SessionList';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { AccountRequests } from './AccountRequests';
import { PrivacyToggle } from './PrivacyToggle';
import { Badge } from '@/components/ui/Badge';
import { getServerT } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await getSession();
  const { t } = await getServerT();
  if (!session) redirect('/login?next=/settings');

  const [devices, me] = await Promise.all([
    auth
      .sessions({ token: session?.accessToken, cache: 'no-store' })
      .catch(() => [] as DeviceSession[]),
    users?.me({ token: session?.accessToken, cache: 'no-store' }).catch(() => null),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">{t.settings.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t.profile.yourRoles}</CardTitle>
          <CardDescription>
            You can hold several at once. Switching between them changes what you see, never what
            you&apos;re allowed to do.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {session?.roles.map((role) => {
            const meta = ROLE_META[role as Role];
            if (!meta) return null;
            const isActive = role === session?.activeRole;
            return (
              <Badge key={role} variant={isActive ? 'primary' : 'outline'}>
                {meta?.label}
                {isActive ? ' · active' : ''}
              </Badge>
            );
          })}
        </CardContent>
      </Card>

      <PrivacyToggle initial={me?.isPrivate ?? false} />

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>{t.settings.password}</CardTitle>
            <CardDescription>
              Change your password. Every other device is signed out when you do.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/password">Change</Link>
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.signedInDevices}</CardTitle>
          <CardDescription>
            Each device gets its own session. Signing out of one leaves the others alone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SessionList devices={devices} currentSessionId={null} />
        </CardContent>
      </Card>
      <AccountRequests />

    </div>
  );
}
