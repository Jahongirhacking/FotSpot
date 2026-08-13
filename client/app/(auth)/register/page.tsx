import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterForm } from './RegisterForm';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { getServerT } from '@/lib/i18n/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

/** The tab title is translated like the page under it — see app/layout.tsx. */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: t.auth.createAccountTitle };
}

export default async function RegisterPage() {
  const { t } = await getServerT();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t.auth.createAccountTitle}</CardTitle>
        <CardDescription>
          Free, always. We&apos;ll ask what you&apos;re here for once you&apos;re in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterForm />
        <OAuthButtons />
        <p className="text-muted mt-6 text-center text-sm">
          {t.auth.alreadyHaveAccount}{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">
            {t.auth.signIn}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
