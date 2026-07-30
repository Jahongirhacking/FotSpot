import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import { RegisterAcademyForm } from './RegisterAcademyForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Register an academy' };

export default async function RegisterAcademyPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/academies/register');

  const { t } = await getServerT();

  // Backend enforces this with @Roles('admin','super_admin'). Explaining it here
  // means anyone following a stale link gets a reason rather than a bare 403.
  const isAdmin = session.roles.includes('admin') || session.roles.includes('super_admin');

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Alert tone="warning" title={t.academy.register}>
          {t.academy.adminOnly}
        </Alert>
        <Button asChild variant="outline">
          <Link href="/academies">{t.nav.academies}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.academy.registerTitle}</CardTitle>
          <CardDescription>{t.academy.registerSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert tone="info">{t.academy.verificationNotice}</Alert>
          <RegisterAcademyForm />
        </CardContent>
      </Card>
    </div>
  );
}
