'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerEmailSchema, type RegisterEmailValues } from '@/lib/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';

/**
 * Deliberately does NOT ask for a role.
 *
 * README §1.2.2: putting a role picker in the signup form is the most expensive
 * place to put a decision — before the user has seen any value, and unanswerable
 * for the common "parent registering for a son" case. The question is asked once,
 * on /welcome, immediately after this.
 */
export function RegisterForm() {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<RegisterEmailValues>({
    resolver: zodResolver(registerEmailSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '' },
  });

  async function onSubmit(values: RegisterEmailValues) {
    setServerError(null);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'register', ...values }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setServerError(body.message ?? 'Could not create your account.');
      return;
    }

    // Straight to the one question that matters (§1.2.2).
    window.location.assign('/welcome');
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert tone="danger">{serverError}</Alert>}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="First name"
          htmlFor="firstName"
          required
          error={form.formState.errors.firstName?.message}
        >
          <Input
            id="firstName"
            autoComplete="given-name"
            aria-invalid={!!form.formState.errors.firstName}
            {...form.register('firstName')}
          />
        </Field>
        <Field
          label="Last name"
          htmlFor="lastName"
          required
          error={form.formState.errors.lastName?.message}
        >
          <Input
            id="lastName"
            autoComplete="family-name"
            aria-invalid={!!form.formState.errors.lastName}
            {...form.register('lastName')}
          />
        </Field>
      </div>

      <Field label="Email" htmlFor="email" required error={form.formState.errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={!!form.formState.errors.email}
          {...form.register('email')}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        required
        hint="At least 8 characters."
        error={form.formState.errors.password?.message}
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!form.formState.errors.password}
          {...form.register('password')}
        />
      </Field>

      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        Create account
      </Button>
    </form>
  );
}
