'use client';

import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, PasswordInput, Textarea } from '@/components/ui/Field';

/**
 * "Delete my account", from the public policy page.
 *
 * ## Why it asks for a password rather than a session
 *
 * This page is public, and deliberately so: somebody who has stopped using the
 * app, or who is reading the policy on a borrowed laptop, still has the right the
 * policy describes. Requiring them to sign in first would put the thing they are
 * trying to stop using in front of the way out.
 *
 * The password is what stands between that and anybody queueing a stranger's
 * account for erasure — an admin who acts on a convincing request does the
 * attacker's work for them. The API checks it, counts failures per IP on a
 * counter of its own, and answers the same "Invalid credentials" whether the
 * account exists or the password was wrong, so this form cannot be used to test
 * which addresses are registered.
 *
 * ## It queues a request; it does not delete
 *
 * Nothing here erases anything. The success message says so plainly rather than
 * implying the account is gone — somebody who believes it is already deleted and
 * later finds their profile still up has been misled by this dialog.
 */
export function DeleteAccountDialog() {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    // One box for both, split on the @: people type back whatever they were
    // shown, and asking which kind of name they have is a question the form can
    // answer itself.
    const looksLikeEmail = identifier.includes('@');

    try {
      const response = await fetch('/api/legal/delete-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(looksLikeEmail
            ? { email: identifier.trim() }
            : { username: identifier.trim().replace(/^@/, '') }),
          password,
          message: message.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        setError(problem?.message ?? t.auth?.couldNotSignIn);
        setBusy(false);
        return;
      }

      setDone(true);
      setBusy(false);
      // Cleared on success so a shared or unattended screen is not left holding
      // a password in a form field.
      setPassword('');
      setIdentifier('');
      setMessage('');
    } catch {
      setError(t.common?.somethingWrong);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setDone(false);
          setError(null);
          setPassword('');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="danger" size="sm">
          <Trash2 aria-hidden /> {t.requests?.askDeleteTitle}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.requests?.askDeleteTitle}</DialogTitle>
          <DialogDescription>{t.requests?.askDeleteBody}</DialogDescription>
        </DialogHeader>

        {done ? (
          <DialogBody>
            <Alert tone="success">{t.requests?.askSent}</Alert>
          </DialogBody>
        ) : (
          <form onSubmit={submit}>
            <DialogBody className="space-y-3">
              {error && <Alert tone="danger">{error}</Alert>}

              <Field label={t.auth?.emailOrUsername} htmlFor="delete-identifier" required>
                <Input
                  id="delete-identifier"
                  required
                  autoComplete="username"
                  placeholder={t.placeholders?.emailOrUsername}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                />
              </Field>

              <Field label={t.auth?.password} htmlFor="delete-password" required>
                <PasswordInput
                  id="delete-password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>

              <Field label={t.requests?.askMessageLabel} htmlFor="delete-message">
                <Textarea
                  id="delete-message"
                  rows={2}
                  placeholder={t.requests?.askMessagePlaceholder}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </Field>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t.common?.cancel}
              </Button>
              <Button type="submit" variant="danger" loading={busy}>
                {t.requests?.askSend}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
