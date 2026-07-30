import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './LoginForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'Sign in' };

/** NOTE (Next 16): `searchParams` is a Promise and must be awaited. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your FotSpot account.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm redirectTo={next} />
        <p className="text-muted mt-6 text-center text-sm">
          New here?{' '}
          <Link href="/register" className="text-primary font-medium hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
