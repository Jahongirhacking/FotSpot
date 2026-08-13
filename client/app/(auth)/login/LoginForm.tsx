'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { homeHrefForRole } from '@/components/layout/nav';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, PasswordInput } from '@/components/ui/Field';
import { resolveActiveRole } from '@/lib/roles';
import {
  loginBody,
  loginEmailSchema,
  requestOtpSchema,
  verifyOtpSchema,
  type LoginEmailValues,
  type RequestOtpValues,
  type VerifyOtpValues,
} from '@/lib/schemas/auth';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useForm } from 'react-hook-form';

type Method = 'phone' | 'email';

/**
 * Phone + OTP is the first tab, not email: it is the primary method in Uzbekistan
 * (README §1.3) and the one a teenager on a prepaid SIM can actually complete.
 */
export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const { t } = useI18n();
  const [method, setMethod] = React.useState<Method>('email');

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label={t.auth.signInMethod}
        className="bg-surface-2 grid grid-cols-2 gap-1 rounded-lg p-1"
      >
        <MethodTab
          active={method === 'email'}
          onClick={() => setMethod('email')}
          icon={Mail}
          label={t.auth.email}
        />
        <MethodTab
          active={method === 'phone'}
          onClick={() => setMethod('phone')}
          icon={Phone}
          label={t.auth.phone}
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

/**
 * Shared post-login navigation: honour `next`, else start where the role starts.
 *
 * "Else /dashboard" was wrong for half the roles. A scout's menu does not contain
 * `/dashboard` at all and a coach's begins at their academy, so signing in put
 * them on a page with nothing highlighted and no obvious next move.
 */
function useAfterLogin(redirectTo?: string) {
  return React.useCallback(
    (roles: string[] = []) => {
      // Hard navigation, not router.push: the server layout must re-read the new
      // session cookies so the shell renders with the right role immediately.
      // Only same-origin paths are honoured — an absolute `next` would be an
      // open redirect.
      if (redirectTo?.startsWith('/')) {
        window.location.assign(redirectTo);
        return;
      }
      window.location.assign(homeHrefForRole(resolveActiveRole(roles, null)));
    },
    [redirectTo],
  );
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

    if (!response?.ok) {
      const body = await response?.json().catch(() => ({}));
      setServerError(body?.message ?? t.auth.couldNotSignIn);
      return;
    }
    // The login route answers with the roles it just wrote cookies for, which is
    // what decides where this account starts.
    const { roles } = await response?.json().catch(() => ({ roles: [] }));
    afterLogin(roles);
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
  /*
   * `phone` asks the server which of the other two comes next, so the button on
   * the first screen is "Continue" rather than "Send code" — pressing it does not
   * necessarily send anything, and most of the time it must not.
   */
  const [stage, setStage] = React.useState<'phone' | 'password' | 'code'>('phone');
  const [phone, setPhone] = React.useState('');
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const afterLogin = useAfterLogin(redirectTo);

  const phoneForm = useForm<RequestOtpValues>({
    resolver: zodResolver(requestOtpSchema),
    defaultValues: { phone: '+998' },
  });

  const passwordForm = useForm<{ phone: string; password: string }>({
    defaultValues: { phone: '', password: '' },
  });

  const codeForm = useForm<VerifyOtpValues>({
    resolver: zodResolver(verifyOtpSchema),
    defaultValues: { phone: '', code: '' },
  });

  /**
   * Asks which screen this number gets, and only sends a code if it needs one.
   *
   * An account that already has a password is asked for it and no SMS is sent —
   * which is the entire point: the old flow texted a code on every single phone
   * login, and each one costs money.
   */
  async function startPhone(values: RequestOtpValues) {
    setServerError(null);
    setPhone(values?.phone);

    const decided = await fetch('/api/auth/phone/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: values?.phone }),
    });
    const decision = await decided?.json().catch(() => ({}));
    if (!decided?.ok) {
      setServerError(decision?.message ?? t.auth.couldNotSignIn);
      return;
    }

    if (decision?.next === 'PASSWORD') {
      passwordForm.setValue('phone', values?.phone);
      setStage('password');
      return;
    }

    await sendCode(values?.phone);
  }

  /** The one place a message is actually asked for. */
  async function sendCode(target: string) {
    const response = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: target }),
    });

    const body = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setServerError(body?.message ?? t.auth.couldNotSendCode);
      return;
    }

    codeForm.setValue('phone', target);
    // The SMS gateway is a documented stub (backend README): in non-production the
    // API echoes the code back so the flow is testable without SMS credentials.
    setDevCode(body?.devCode ?? null);
    setStage('code');
  }

  /** Phone + password, through the same route every other password login uses. */
  async function loginWithPassword(values: { phone: string; password: string }) {
    setServerError(null);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'password', phone: values?.phone, password: values?.password }),
    });

    if (!response?.ok) {
      const body = await response?.json().catch(() => ({}));
      setServerError(body?.message ?? t.auth.couldNotSignIn);
      return;
    }
    const { roles } = await response?.json().catch(() => ({ roles: [] }));
    afterLogin(roles);
  }

  async function verify(values: VerifyOtpValues) {
    setServerError(null);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'otp', ...values }),
    });

    if (!response?.ok) {
      const body = await response?.json().catch(() => ({}));
      setServerError(body?.message ?? t.auth.codeDidNotWork);
      return;
    }
    const { roles } = await response?.json().catch(() => ({ roles: [] }));
    afterLogin(roles);
  }

  if (stage === 'phone') {
    return (
      <form onSubmit={phoneForm.handleSubmit(startPhone)} className="space-y-4" noValidate>
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
          {t.common.continue}
        </Button>
      </form>
    );
  }

  if (stage === 'password') {
    return (
      <form
        onSubmit={passwordForm.handleSubmit(loginWithPassword)}
        className="space-y-4"
        noValidate
      >
        {serverError && <Alert tone="danger">{serverError}</Alert>}

        <p className="text-muted text-sm">{f(t.auth.sentTo, { destination: phone })}</p>

        <Field label={t.auth.password} htmlFor="phone-password" required>
          <PasswordInput
            id="phone-password"
            autoComplete="current-password"
            {...passwordForm.register('password', { required: true })}
          />
        </Field>

        <Button type="submit" className="w-full" loading={passwordForm.formState.isSubmitting}>
          {t.auth.signIn}
        </Button>

        {/* The way out for somebody who has forgotten it: a code still works,
            because the account can always prove the number. */}
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => void sendCode(phone)}
        >
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
