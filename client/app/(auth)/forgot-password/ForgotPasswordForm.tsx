'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import {
  forgotPasswordSchema,
  newPasswordSchema,
  resetCodeSchema,
  type ForgotPasswordValues,
  type NewPasswordValues,
  type ResetCodeValues,
} from '@/lib/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Field, Input, PasswordInput } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { useI18n } from '@/components/layout/I18nProvider';

type Step = 'request' | 'code' | 'password';

/** Posts one step of the reset and returns the parsed body, or throws its message. */
async function postStep(step: 'forgot' | 'verify' | 'reset', body: Record<string, string>) {
  const response = await fetch('/api/auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step, ...body }),
  });

  const parsed = await response?.json().catch(() => ({}));
  if (!response?.ok) throw new Error(parsed.message);
  return parsed as { devCode?: string };
}

/**
 * Reset in three steps: ask for a code, prove it, then choose the password.
 *
 * The code is checked on its own before the password is asked for. Taking both at
 * once means a mistyped code throws away a password the user has already entered
 * twice, and the error cannot say which of the two was wrong. One extra round trip
 * removes both problems.
 *
 * That check grants nothing — `POST /auth/password/reset` verifies the code again
 * from scratch — so the split is a matter of sequencing the questions, not of
 * where the authorisation lives.
 *
 * Everything stays on one screen and the identifier carries across, because the
 * person here has already failed to sign in once and every field they retype is
 * another chance to give up.
 *
 * Step 1's confirmation is worded "if that account exists" rather than "sent",
 * since the API answers identically either way and will not confirm whether an
 * address is registered — see `AuthService.forgotPassword`. The later steps are
 * reachable regardless, which is what makes that possible.
 */
export function ForgotPasswordForm({ initialIdentifier }: { initialIdentifier: string }) {
  const { t } = useI18n();
  const [step, setStep] = React.useState<Step>('request');
  const [identifier, setIdentifier] = React.useState(initialIdentifier);
  const [code, setCode] = React.useState('');
  const [devCode, setDevCode] = React.useState<string | null>(null);

  if (step === 'request') {
    return (
      <RequestStep
        initialIdentifier={identifier}
        onSent={(value, dev) => {
          setIdentifier(value);
          setDevCode(dev);
          setStep('code');
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Alert tone="info">{t.auth.resetSent}</Alert>
      {devCode && step === 'code' && (
        // Email delivery is a documented stub, so in development the API hands the
        // code back and the flow stays testable without an SMTP account.
        <Alert tone="info" title={t.auth.devMode}>
          <strong className="font-mono tracking-wider">{devCode}</strong>
        </Alert>
      )}

      {step === 'code' ? (
        <CodeStep
          identifier={identifier}
          onVerified={(value) => {
            setCode(value);
            setStep('password');
          }}
          onBack={() => setStep('request')}
        />
      ) : (
        <PasswordStep identifier={identifier} code={code} onBack={() => setStep('code')} />
      )}
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
    try {
      const body = await postStep('forgot', { identifier: values?.identifier });
      onSent(values?.identifier, body?.devCode ?? null);
    } catch (error) {
      setServerError((error as Error).message || t.auth.couldNotSendCode);
    }
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

function CodeStep({
  identifier,
  onVerified,
  onBack,
}: {
  identifier: string;
  onVerified: (code: string) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<ResetCodeValues>({
    resolver: zodResolver(resetCodeSchema),
    defaultValues: { identifier, code: '' },
  });

  async function onSubmit(values: ResetCodeValues) {
    setServerError(null);
    try {
      await postStep('verify', { identifier: values?.identifier, code: values?.code });
      // Zod has already stripped spacing and upper-cased it, so what moves to the
      // next step is the form the server will see.
      onVerified(values?.code);
    } catch (error) {
      setServerError((error as Error).message || t.auth.codeDidNotWork);
    }
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
          autoFocus
          placeholder={t.placeholders.resetCode}
          className="text-center font-mono text-lg tracking-[0.3em] uppercase"
          aria-invalid={!!form.formState.errors.code}
          {...form.register('code')}
        />
      </Field>

      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t.auth.verifyCode}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
        {t.common.back}
      </Button>
    </form>
  );
}

function PasswordStep({
  identifier,
  code,
  onBack,
}: {
  identifier: string;
  code: string;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  async function onSubmit(values: NewPasswordValues) {
    setServerError(null);
    try {
      await postStep('reset', { identifier, code, newPassword: values?.newPassword });
      // Straight to sign-in, with nothing carried over: the reset issues no tokens,
      // and typing the new password once more is what proves it was remembered.
      window.location.assign('/login?reset=1');
    } catch (error) {
      setServerError((error as Error).message || t.auth.couldNotReset);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert tone="danger">{serverError}</Alert>}

      <p className="text-success flex items-center gap-1.5 text-sm">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        {t.auth.codeVerified}
      </p>

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
          autoFocus
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
        {t.auth.useDifferentCode}
      </Button>

      <p className="text-muted text-xs">{t.auth.resetNote}</p>
    </form>
  );
}
