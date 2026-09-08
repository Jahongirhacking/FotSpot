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
  /*
   * Two reasons to be held here, two sentences. A minted account is asked to
   * replace the password an admin also knows; an account that arrived through
   * Google, Telegram or a code has none, and is asked to set one so it can
   * sign in with its username next time.
   */
  const setting = forced && me?.hasPassword === false;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {forced && (
        <Alert
          tone={setting ? 'info' : 'warning'}
          title={setting ? t.settings.setPasswordTitle : t.settings.mustChangeTitle}
        >
          {setting ? t.settings.setPasswordHint : t.settings.mustChangeHint}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.password}</CardTitle>
          <CardDescription>
            {/* What they will sign in with, once there is a password: the
                handle, and the email when the account has one. */}
            {[
              me?.username ? `${t.admin.username}: ${me.username}` : null,
              setting && me?.email ? `${t.auth.email}: ${me.email}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || t.settings.passwordSubtitle}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm forced={forced} />
        </CardContent>
      </Card>
    </div>
  );
}
