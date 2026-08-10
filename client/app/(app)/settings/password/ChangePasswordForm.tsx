'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import { useI18n } from '@/components/layout/I18nProvider';
import { homeHrefForRole } from '@/components/layout/nav';
import { useSession } from '@/components/layout/SessionProvider';
import { Button } from '@/components/ui/Button';
import { Field, PasswordInput } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';

const MIN_LENGTH = 8;

/**
 * Sets a new password.
 *
 * `forced` is true for an account still holding the password an admin generated
 * for it. In that state the current password is not asked for — the user proved
 * possession by signing in with it moments ago, and asking them to retype a
 * fourteen-character random string they were sent over Telegram is friction that
 * buys nothing.
 *
 * Every other session is revoked server-side on success, which is the whole point
 * when the reason for the change is that somebody else has seen the old one.
 */
export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { activeRole } = useSession();

  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const change = useMutation({
    mutationFn: (body: { currentPassword?: string; newPassword: string }) =>
      browserFetch('/auth/password', { method: 'POST', body }),
    onSuccess: () => {
      setDone(true);
      setError(null);
      setCurrent('');
      setNext('');
      setConfirm('');
      // The role/claims snapshot is unaffected, but the server just revoked the
      // other sessions — re-render so anything stale re-reads.
      router.refresh();
      // Out of the forced-change screen and into wherever this account actually
      // works: a coach sent to `/dashboard` arrives on a page absent from their
      // own menu, having just been made to change a password.
      if (forced) router.push(homeHrefForRole(activeRole));
    },
    onError: (err: Error) => setError(err.message),
  });

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = next.length >= MIN_LENGTH && confirm === next && (forced || current.length > 0);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        change.mutate({
          ...(forced ? {} : { currentPassword: current }),
          newPassword: next,
        });
      }}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {done && !forced && <Alert tone="success">{t.settings.passwordChanged}</Alert>}

      {!forced && (
        <Field label={t.settings.currentPassword} htmlFor="pw-current" required>
          <PasswordInput
            id="pw-current"
            autoComplete="current-password"
            placeholder={t.placeholders.currentPassword}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </Field>
      )}

      <Field
        label={t.settings.newPassword}
        htmlFor="pw-new"
        required
        hint={t.settings.passwordHint}
        error={tooShort ? t.settings.passwordTooShort : undefined}
      >
        <PasswordInput
          id="pw-new"
          autoComplete="new-password"
          placeholder={t.placeholders.newPassword}
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
      </Field>

      <Field
        label={t.settings.confirmPassword}
        htmlFor="pw-confirm"
        required
        error={mismatch ? t.settings.passwordMismatch : undefined}
      >
        <PasswordInput
          id="pw-confirm"
          autoComplete="new-password"
          placeholder={t.placeholders.confirmPassword}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </Field>

      <Button type="submit" loading={change.isPending} disabled={!ready}>
        <KeyRound aria-hidden /> {t.settings.setPassword}
      </Button>

      <p className="text-muted text-xs">{t.settings.otherSessionsRevoked}</p>
    </form>
  );
}
