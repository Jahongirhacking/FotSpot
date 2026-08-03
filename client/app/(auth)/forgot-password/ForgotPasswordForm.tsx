'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  type ForgotPasswordValues,
  type ResetPasswordValues,
} from '@/lib/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Field, Input, PasswordInput } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { useI18n } from '@/components/layout/I18nProvider';

/**
 * Reset in two steps: ask for a code, then spend it on a new password.
 *
 * Both steps stay on one screen and the identifier carries across, because the
 * person here has already failed to sign in once and every extra field is another
 * chance to give up.
 *
 * Step 1's confirmation is worded "if that account exists" rather than "sent",
 * since the API answers identically either way and will not confirm whether an
 * address is registered — see `AuthService.forgotPassword`. Step 2 is reachable
 * regardless, which is what makes that possible.
 */
export function ForgotPasswordForm({ initialIdentifier }: { initialIdentifier: string }) {
  const { t } = useI18n();
  const [step, setStep] = React.useState<'request' | 'reset'>('request');
  const [identifier, setIdentifier] = React.useState(initialIdentifier);
  const [devCode, setDevCode] = React.useState<string | null>(null);

  if (step === 'request') {
    return (
      <RequestStep
        initialIdentifier={identifier}
        onSent={(value, code) => {
          setIdentifier(value);
          setDevCode(code);
          setStep('reset');
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Alert tone="info">{t.auth.resetSent}</Alert>
      {devCode && (
        // Email delivery is a documented stub, so in development the API hands the
        // code back and the flow stays testable without an SMTP account.
        <Alert tone="info" title={t.auth.devMode}>
          <strong className="font-mono tracking-wider">{devCode}</strong>
        </Alert>
      )}
      <ResetStep identifier={identifier} onBack={() => setStep('request')} />
    </div>
  );
}

function RequestStep({
  initialIdentifier,
  onSent,
}: {
  initialIdentifier: string;
  onSent: (identifier: string, devCode: string | null) => void;
}) {
  const { t } = useI18n();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { identifier: initialIdentifier },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    setServerError(null);
    const response = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'forgot', identifier: values.identifier }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setServerError(body.message ?? t.auth.couldNotSendCode);
      return;
    }
    onSent(values.identifier, body.devCode ?? null);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert tone="danger">{serverError}</Alert>}

      <Field
        label={t.auth.emailOrUsername}
        htmlFor="identifier"
        required
        error={form.formState.errors.identifier?.message}
      >
        <Input
          id="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t.placeholders.emailOrUsername}
          aria-invalid={!!form.formState.errors.identifier}
          {...form.register('identifier')}
        />
      </Field>

      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t.auth.sendCodeToEmail}
      </Button>
    </form>
  );
}

function ResetStep({ identifier, onBack }: { identifier: string; onBack: () => void }) {
  const { t } = useI18n();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { identifier, code: '', newPassword: '', confirmPassword: '' },
  });

  async function onSubmit(values: ResetPasswordValues) {
    setServerError(null);
    const response = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step: 'reset',
        identifier: values.identifier,
        code: values.code,
        newPassword: values.newPassword,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setServerError(body.message ?? t.auth.couldNotReset);
      return;
    }

    // Straight to sign-in, with nothing carried over: the reset issues no tokens,
    // and typing the new password once more is what proves it was remembered.
    window.location.assign('/login?reset=1');
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert tone="danger">{serverError}</Alert>}

      <Field
        label={t.auth.resetCodeLabel}
        htmlFor="reset-code"
        required
        hint={t.auth.resetCodeHint}
        error={form.formState.errors.code?.message}
      >
        <Input
          id="reset-code"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          placeholder={t.placeholders.resetCode}
          className="text-center font-mono text-lg tracking-[0.3em] uppercase"
          aria-invalid={!!form.formState.errors.code}
          {...form.register('code')}
        />
      </Field>

      <Field
        label={t.auth.newPassword}
        htmlFor="reset-password"
        required
        hint={t.auth.passwordHint}
        error={form.formState.errors.newPassword?.message}
      >
        <PasswordInput
          id="reset-password"
          autoComplete="new-password"
          placeholder={t.placeholders.newPassword}
          aria-invalid={!!form.formState.errors.newPassword}
          {...form.register('newPassword')}
        />
      </Field>

      <Field
        label={t.auth.confirmPassword}
        htmlFor="reset-confirm"
        required
        error={form.formState.errors.confirmPassword?.message}
      >
        <PasswordInput
          id="reset-confirm"
          autoComplete="new-password"
          placeholder={t.placeholders.confirmPassword}
          aria-invalid={!!form.formState.errors.confirmPassword}
          {...form.register('confirmPassword')}
        />
      </Field>

      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t.auth.setNewPassword}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
        {t.common.back}
      </Button>

      <p className="text-muted text-xs">{t.auth.resetNote}</p>
    </form>
  );
}
