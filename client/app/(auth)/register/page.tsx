import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterForm } from './RegisterForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'Create an account' };

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>
          Free, always. We&apos;ll ask what you&apos;re here for once you&apos;re in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
        <p className="text-muted mt-6 text-center text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
