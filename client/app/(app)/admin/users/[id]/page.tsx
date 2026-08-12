import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/session';
import { isAdminActing, isSuperAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { admin } from '@/lib/api/resources';
import { ApiError } from '@/lib/api/client';
import { UserDetailView } from './UserDetailView';
import { Alert } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'User' };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/admin/users/${id}`);

  const { t } = await getServerT();
  const isAdmin = isAdminActing(session?.activeRole);
  if (!isAdmin) return <Alert tone="warning">{t.academy.adminOnly}</Alert>;

  let user;
  try {
    user = await admin.userDetail(id, { token: session?.accessToken, activeRole: session?.activeRole, cache: 'no-store' });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/users">
          <ArrowLeft aria-hidden /> {t.admin.users}
        </Link>
      </Button>

      {/* Mutations are gated on super admin here AND on the backend. */}
      <UserDetailView user={user} canEdit={isSuperAdminActing(session?.activeRole)} />
    </div>
  );
}
