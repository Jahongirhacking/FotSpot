'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  registerEmailSchema,
  registrationCodeSchema,
  type RegisterEmailValues,
  type RegistrationCodeValues,
} from '@/lib/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Field, Input, PasswordInput } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { useI18n } from '@/components/layout/I18nProvider';

/**
 * Deliberately does NOT ask for a role.
 *
 * README §1.2.2: putting a role picker in the signup form is the most expensive
 * place to put a decision — before the user has seen any value, and unanswerable
 * for the common "parent registering for a son" case. The question is asked once,
 * on /welcome, immediately after this.
 *
 * ## Two steps, because the address is proved before the account exists
 *
 * The details are collected, a code goes to the address, and only a correct code
 * creates the account. Nothing is written in between, so there is no such thing
 * as an unverified account to chase later — and no window in which one can be
 * used. The details stay in component state across the two steps rather than
 * being parked server-side, which keeps a half-finished signup entirely local.
 */
export function RegisterForm() {
  const { t } = useI18n();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<RegisterEmailValues | null>(null);
  const [devCode, setDevCode] = React.useState<string | null>(null);

  const form = useForm<RegisterEmailValues>({
    resolver: zodResolver(registerEmailSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '' },
  });

  async function onSubmit(values: RegisterEmailValues) {
    setServerError(null);
    const response = await fetch('/api/auth/register-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: values?.email }),
    });

    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setServerError(body?.message ?? t.auth.couldNotCreate);
      return;
    }

    setDevCode(body?.devCode ?? null);
    setPending(values);
  }

  if (pending) {
    return (
      <ConfirmEmailStep
        details={pending}
        devCode={devCode}
        onBack={() => {
          setPending(null);
          setDevCode(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert tone="danger">{serverError}</Alert>}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t.auth.firstName}
          htmlFor="firstName"
          required
          error={form.formState.errors.firstName?.message}
        >
          <Input
            id="firstName"
            autoComplete="given-name"
            placeholder={t.placeholders.firstName}
            aria-invalid={!!form.formState.errors.firstName}
            {...form.register('firstName')}
          />
        </Field>
        <Field
          label={t.auth.lastName}
          htmlFor="lastName"
          required
          error={form.formState.errors.lastName?.message}
        >
          <Input
            id="lastName"
            autoComplete="family-name"
            placeholder={t.placeholders.lastName}
            aria-invalid={!!form.formState.errors.lastName}
            {...form.register('lastName')}
          />
        </Field>
      </div>

      <Field
        label={t.auth.email}
        htmlFor="email"
        required
        hint={t.auth.emailCodeNotice}
        error={form.formState.errors.email?.message}
      >
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder={t.placeholders.email}
          aria-invalid={!!form.formState.errors.email}
          {...form.register('email')}
        />
      </Field>

      <Field
        label={t.auth.password}
        htmlFor="password"
        required
        hint={t.auth.passwordHint}
        error={form.formState.errors.password?.message}
      >
        <PasswordInput
          id="password"
          autoComplete="new-password"
          placeholder={t.placeholders.password}
          aria-invalid={!!form.formState.errors.password}
          {...form.register('password')}
        />
      </Field>

      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t.auth.sendCode}
      </Button>
    </form>
  );
}

/** Step 2. A wrong code costs a retry, not the form they already filled in. */
function ConfirmEmailStep({
  details,
  devCode,
  onBack,
}: {
  details: RegisterEmailValues;
  devCode: string | null;
  onBack: () => void;
}) {
  const { t, f } = useI18n();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<RegistrationCodeValues>({
    resolver: zodResolver(registrationCodeSchema),
    defaultValues: { code: '' },
  });

  async function onSubmit(values: RegistrationCodeValues) {
    setServerError(null);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'register', ...details, code: values?.code }),
    });

    if (!response?.ok) {
      const body = await response?.json().catch(() => ({}));
      setServerError(body?.message ?? t.auth.codeDidNotWork);
      return;
    }

    // Straight to the one question that matters (§1.2.2).
    window.location.assign('/welcome');
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert tone="danger">{serverError}</Alert>}

      <p className="text-muted text-sm">{f(t.auth.sentTo, { destination: details?.email })}</p>

      {devCode && (
        <Alert tone="info" title={t.auth.devMode}>
          {f(t.auth.devCodeNotice, { code: devCode })}
        </Alert>
      )}

      <Field
        label={t.auth.enterCode}
        htmlFor="code"
        required
        error={form.formState.errors.code?.message}
      >
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder={t.placeholders.code6}
          className="text-center font-mono text-lg tracking-[0.4em]"
          aria-invalid={!!form.formState.errors.code}
          {...form.register('code')}
        />
      </Field>

      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t.auth.createAccount}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
        {t.common.back}
      </Button>
    </form>
  );
}
