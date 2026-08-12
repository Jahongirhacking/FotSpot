import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import { users } from '@/lib/api/resources';
import { ChangePasswordForm } from './ChangePasswordForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';

export const metadata: Metadata = { title: 'Password' };

export default async function PasswordPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/settings/password');

  const { t } = await getServerT();
  const me = await users?.me({ token: session?.accessToken, cache: 'no-store' }).catch(() => null);
  const forced = Boolean(me?.mustChangePassword);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {forced && (
        <Alert tone="warning" title={t.settings.mustChangeTitle}>
          {t.settings.mustChangeHint}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.password}</CardTitle>
          <CardDescription>
            {me?.username ? `${t.admin.username}: ${me.username}` : t.settings.passwordSubtitle}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm forced={forced} />
        </CardContent>
      </Card>
    </div>
  );
}
