'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Mail, Phone } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { ContactChangeTicket } from '@/lib/api/resources';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';

type Channel = 'PHONE' | 'EMAIL';

/**
 * Two-step phone/email change: request a code to the NEW destination, then confirm.
 *
 * The code proves the caller controls the destination before it replaces what's on
 * the account — otherwise a typo silently locks someone out of their own login.
 */
export function ChangeContact({ channel, current }: { channel: Channel; current: string | null }) {
  const { t, f } = useI18n();
  const router = useRouter();

  const [stage, setStage] = React.useState<'idle' | 'code'>('idle');
  const [destination, setDestination] = React.useState('');
  const [code, setCode] = React.useState('');
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [deliveryConfigured, setDeliveryConfigured] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const isPhone = channel === 'PHONE';
  const Icon = isPhone ? Phone : Mail;
  const fieldId = `contact-${channel.toLowerCase()}`;

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const ticket = await browserFetch<ContactChangeTicket>('/users/me/contact/request', {
        method: 'POST',
        body: { channel, destination },
      });
      setDevCode(ticket.devCode ?? null);
      setDeliveryConfigured(ticket.deliveryConfigured);
      setStage('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await browserFetch('/users/me/contact/verify', {
        method: 'POST',
        body: { channel, destination, code },
      });
      setDone(true);
      setStage('idle');
      setCode('');
      setDestination('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="text-primary size-4" aria-hidden />
          {isPhone ? t.profile.changePhone : t.profile.changeEmail}
        </CardTitle>
        <CardDescription>
          {current
            ? f(t.profile.currentContact, { value: current })
            : isPhone
              ? t.profile.noPhoneSet
              : t.profile.noEmailSet}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {done && (
          <Alert tone="success">
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5" aria-hidden /> {t.profile.contactUpdated}
            </span>
          </Alert>
        )}

        {stage === 'idle' ? (
          <form onSubmit={requestCode} className="space-y-3" noValidate>
            <Field
              label={isPhone ? t.profile.newPhone : t.profile.newEmail}
              htmlFor={fieldId}
              hint={isPhone ? t.auth.phoneHint : t.profile.emailCodeHint}
            >
              <Input
                id={fieldId}
                type={isPhone ? 'tel' : 'email'}
                inputMode={isPhone ? 'tel' : 'email'}
                placeholder={isPhone ? '+998 90 123 45 67' : 'name@example.com'}
                value={destination}
                onChange={(event) => {
                  setDestination(event.target.value);
                  setDone(false);
                }}
              />
            </Field>
            <Button type="submit" variant="outline" loading={busy} disabled={!destination.trim()}>
              {t.auth.sendCode}
            </Button>
          </form>
        ) : (
          <form onSubmit={confirm} className="space-y-3" noValidate>
            {!deliveryConfigured && (
              <Alert tone="warning" title={t.auth.devMode}>
                {isPhone ? t.profile.smsNotConfigured : t.profile.emailNotConfigured}
                {devCode && (
                  <>
                    {' '}
                    <strong>{devCode}</strong>
                  </>
                )}
              </Alert>
            )}

            <Field
              label={t.auth.enterCode}
              htmlFor={`${fieldId}-code`}
              hint={`${t.auth.sentTo} ${destination}`}
            >
              <Input
                id={`${fieldId}-code`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                className="text-center font-mono text-lg tracking-[0.4em]"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStage('idle');
                  setCode('');
                  setDevCode(null);
                }}
              >
                {t.common.back}
              </Button>
              <Button type="submit" loading={busy} disabled={code.length !== 6}>
                {t.common.save}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
