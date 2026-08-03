'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Phone } from 'lucide-react';
import {
  loginBody,
  loginEmailSchema,
  requestOtpSchema,
  verifyOtpSchema,
  type LoginEmailValues,
  type RequestOtpValues,
  type VerifyOtpValues,
} from '@/lib/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Field, Input, PasswordInput } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/layout/I18nProvider';

type Method = 'phone' | 'email';

/**
 * Phone + OTP is the first tab, not email: it is the primary method in Uzbekistan
 * (README §1.3) and the one a teenager on a prepaid SIM can actually complete.
 */
export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const { t } = useI18n();
  const [method, setMethod] = React.useState<Method>('phone');

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label={t.auth.signInMethod}
        className="bg-surface-2 grid grid-cols-2 gap-1 rounded-lg p-1"
      >
        <MethodTab
          active={method === 'phone'}
          onClick={() => setMethod('phone')}
          icon={Phone}
          label="Phone"
        />
        <MethodTab
          active={method === 'email'}
          onClick={() => setMethod('email')}
          icon={Mail}
          label="Email"
        />
      </div>

      {method === 'phone' ? (
        <PhoneLogin redirectTo={redirectTo} />
      ) : (
        <EmailLogin redirectTo={redirectTo} />
      )}
    </div>
  );
}

function MethodTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex min-h-10 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors',
        active ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}

/** Shared post-login navigation: honour `next`, else let /dashboard route by role. */
function useAfterLogin(redirectTo?: string) {
  return React.useCallback(() => {
    // Hard navigation, not router.push: the server layout must re-read the new
    // session cookies so the shell renders with the right role immediately.
    // Only same-origin paths are honoured — an absolute `next` would be an open
    // redirect.
    window.location.assign(redirectTo?.startsWith('/') ? redirectTo : '/dashboard');
  }, [redirectTo]);
}

function EmailLogin({ redirectTo }: { redirectTo?: string }) {
  const { t } = useI18n();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const afterLogin = useAfterLogin(redirectTo);

  const form = useForm<LoginEmailValues>({
    resolver: zodResolver(loginEmailSchema),
    defaultValues: { identifier: '', password: '' },
  });

  async function onSubmit(values: LoginEmailValues) {
    setServerError(null);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'email', ...loginBody(values) }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setServerError(body.message ?? t.auth.couldNotSignIn);
      return;
    }
    afterLogin();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && (
        <Alert tone="danger">
          <span className="space-y-2">
            <span className="block">{serverError}</span>
            {/* Surfaced on failure rather than sitting under the form at all
                times: a wrong password is the moment the offer is useful, and the
                identifier they already typed travels with them. */}
            <Link
              href={`/forgot-password?identifier=${encodeURIComponent(form.getValues('identifier'))}`}
              className="font-medium underline underline-offset-2"
            >
              {t.auth.forgotPassword}
            </Link>
          </span>
        </Alert>
      )}

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

      <Field
        label={t.auth.password}
        htmlFor="password"
        required
        error={form.formState.errors.password?.message}
      >
        <PasswordInput
          id="password"
          autoComplete="current-password"
          placeholder={t.placeholders.password}
          aria-invalid={!!form.formState.errors.password}
          {...form.register('password')}
        />
      </Field>

      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        {t.auth.signIn}
      </Button>

      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-muted hover:text-foreground hover:underline">
          {t.auth.forgotPassword}
        </Link>
      </p>
    </form>
  );
}

function PhoneLogin({ redirectTo }: { redirectTo?: string }) {
  const { t, f } = useI18n();
  const [stage, setStage] = React.useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = React.useState('');
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const afterLogin = useAfterLogin(redirectTo);

  const phoneForm = useForm<RequestOtpValues>({
    resolver: zodResolver(requestOtpSchema),
    defaultValues: { phone: '+998' },
  });

  const codeForm = useForm<VerifyOtpValues>({
    resolver: zodResolver(verifyOtpSchema),
    defaultValues: { phone: '', code: '' },
  });

  async function requestCode(values: RequestOtpValues) {
    setServerError(null);
    const response = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setServerError(body.message ?? t.auth.couldNotSendCode);
      return;
    }

    setPhone(values.phone);
    codeForm.setValue('phone', values.phone);
    // The SMS gateway is a documented stub (backend README): in non-production the
    // API echoes the code back so the flow is testable without SMS credentials.
    setDevCode(body.devCode ?? null);
    setStage('code');
  }

  async function verify(values: VerifyOtpValues) {
    setServerError(null);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'otp', ...values }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setServerError(body.message ?? t.auth.codeDidNotWork);
      return;
    }
    afterLogin();
  }

  if (stage === 'phone') {
    return (
      <form onSubmit={phoneForm.handleSubmit(requestCode)} className="space-y-4" noValidate>
        {serverError && <Alert tone="danger">{serverError}</Alert>}

        <Field
          label={t.auth.phoneNumber}
          htmlFor="phone"
          required
          hint={t.auth.phoneHint}
          error={phoneForm.formState.errors.phone?.message}
        >
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+998 90 123 45 67"
            aria-invalid={!!phoneForm.formState.errors.phone}
            {...phoneForm.register('phone')}
          />
        </Field>

        <Button type="submit" className="w-full" loading={phoneForm.formState.isSubmitting}>
          {t.auth.sendCode}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={codeForm.handleSubmit(verify)} className="space-y-4" noValidate>
      {serverError && <Alert tone="danger">{serverError}</Alert>}
      {devCode && (
        <Alert tone="info" title={t.auth.devMode}>
          {f(t.auth.devCodeNotice, { code: devCode })} <strong>{devCode}</strong>
        </Alert>
      )}

      <Field
        label={t.auth.enterCode}
        htmlFor="code"
        required
        hint={f(t.auth.sentTo, { destination: phone })}
        error={codeForm.formState.errors.code?.message}
      >
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder={t.placeholders.code6}
          className="text-center font-mono text-lg tracking-[0.4em]"
          aria-invalid={!!codeForm.formState.errors.code}
          {...codeForm.register('code')}
        />
      </Field>

      <Button type="submit" className="w-full" loading={codeForm.formState.isSubmitting}>
        {t.auth.signIn}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => {
          setStage('phone');
          setDevCode(null);
        }}
      >
        {t.auth.useDifferentNumber}
      </Button>
    </form>
  );
}
