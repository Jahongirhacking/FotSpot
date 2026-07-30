import type { Metadata } from 'next';
import { RegisterAcademyForm } from './RegisterAcademyForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';

export const metadata: Metadata = { title: 'Register an academy' };

export default function RegisterAcademyPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Register your academy</CardTitle>
          <CardDescription>
            An admin reviews every academy before it goes live. You become its manager once
            approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert tone="info">
            Verification exists to keep fake academies away from children. Expect a real person to
            check this.
          </Alert>
          <RegisterAcademyForm />
        </CardContent>
      </Card>
    </div>
  );
}
