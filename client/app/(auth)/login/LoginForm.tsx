'use client';

import * as React from 'react';
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
import { Field, Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { cn } from '@/lib/utils';

type Method = 'phone' | 'email';

/**
 * Phone + OTP is the first tab, not email: it is the primary method in Uzbekistan
 * (README §1.3) and the one a teenager on a prepaid SIM can actually complete.
 */
export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [method, setMethod] = React.useState<Method>('phone');

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Sign-in method"
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
      setServerError(body.message ?? 'Could not sign you in.');
      return;
    }
    afterLogin();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert tone="danger">{serverError}</Alert>}

      <Field
        label="Email or username"
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
          aria-invalid={!!form.formState.errors.identifier}
          {...form.register('identifier')}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        required
        error={form.formState.errors.password?.message}
      >
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!form.formState.errors.password}
          {...form.register('password')}
        />
      </Field>

      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}

function PhoneLogin({ redirectTo }: { redirectTo?: string }) {
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
      setServerError(body.message ?? 'Could not send the code.');
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
      setServerError(body.message ?? "That code didn't work.");
      return;
    }
    afterLogin();
  }

  if (stage === 'phone') {
    return (
      <form onSubmit={phoneForm.handleSubmit(requestCode)} className="space-y-4" noValidate>
        {serverError && <Alert tone="danger">{serverError}</Alert>}

        <Field
          label="Phone number"
          htmlFor="phone"
          required
          hint="We'll text you a 6-digit code."
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
          Send code
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={codeForm.handleSubmit(verify)} className="space-y-4" noValidate>
      {serverError && <Alert tone="danger">{serverError}</Alert>}
      {devCode && (
        <Alert tone="info" title="Development mode">
          SMS isn&apos;t wired up yet, so here is your code: <strong>{devCode}</strong>
        </Alert>
      )}

      <Field
        label="Enter the code"
        htmlFor="code"
        required
        hint={`Sent to ${phone}`}
        error={codeForm.formState.errors.code?.message}
      >
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          className="text-center font-mono text-lg tracking-[0.4em]"
          aria-invalid={!!codeForm.formState.errors.code}
          {...codeForm.register('code')}
        />
      </Field>

      <Button type="submit" className="w-full" loading={codeForm.formState.isSubmitting}>
        Sign in
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
        Use a different number
      </Button>
    </form>
  );
}
