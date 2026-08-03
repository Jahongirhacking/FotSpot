import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './LoginForm';
import { getServerT } from '@/lib/i18n/server';
import { Alert } from '@/components/ui/Feedback';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'Sign in' };

/** NOTE (Next 16): `searchParams` is a Promise and must be awaited. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const { next, reset } = await searchParams;
  const { t } = await getServerT();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t.auth.welcomeBack}</CardTitle>
        <CardDescription>{t.auth.signInSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Set by the reset flow, which deliberately hands back no session — this
            is the only acknowledgement that it worked. */}
        {reset && <Alert tone="success">{t.auth.resetDone}</Alert>}
        <LoginForm redirectTo={next} />
        <p className="text-muted mt-6 text-center text-sm">
          {t.auth.newHere}{' '}
          <Link href="/register" className="text-primary font-medium hover:underline">
            {t.auth.createAccount}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
