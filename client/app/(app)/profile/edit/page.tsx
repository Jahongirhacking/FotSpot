import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/session';
import { users } from '@/lib/api/resources';
import { getServerT } from '@/lib/i18n/server';
import { EditIdentity } from './EditIdentity';
import { ChangeContact } from './ChangeContact';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';

export const metadata: Metadata = { title: 'Edit profile' };

export default async function EditProfilePage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/profile/edit');

  const { t } = await getServerT();
  const me = await users.me({ token: session.accessToken, cache: 'no-store' }).catch(() => null);

  if (!me) return <Alert tone="danger">{t.common.couldNotLoad}</Alert>;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t.common.back}>
          <Link href="/profile">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">{t.profile.editProfile}</h1>
      </div>

      <EditIdentity
        initial={{
          firstName: me.firstName ?? '',
          lastName: me.lastName ?? '',
          username: me.username ?? '',
          avatarUrl: me.avatarUrl ?? null,
        }}
      />

      <ChangeContact channel="PHONE" current={me.phone ?? null} />
      <ChangeContact channel="EMAIL" current={me.email ?? null} />
    </div>
  );
}
