import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { getServerT } from '@/lib/i18n/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

/** The tab title is translated like the page under it — see app/layout.tsx. */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: t.auth.forgotTitle };
}

/**
 * NOTE (Next 16): `searchParams` is a Promise and must be awaited.
 *
 * The sign-in form passes whatever the user had already typed, so arriving here
 * after a failed attempt does not mean typing the address again.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ identifier?: string }>;
}) {
  const { identifier } = await searchParams;
  const { t } = await getServerT();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t.auth.forgotTitle}</CardTitle>
        <CardDescription>{t.auth.forgotSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm initialIdentifier={identifier ?? ''} />
        <p className="text-muted mt-6 text-center text-sm">
          <Link href="/login" className="text-primary font-medium hover:underline">
            {t.auth.backToSignIn}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
