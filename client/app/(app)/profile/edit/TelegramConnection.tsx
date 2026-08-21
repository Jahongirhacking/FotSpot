'use client';

import { Check, Send } from 'lucide-react';
import * as React from 'react';

import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { browserFetch } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/client';
import type { TelegramStatus, TelegramWidgetPayload } from '@/lib/api/resources';

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? '';

/**
 * Connecting and disconnecting Telegram, from the profile screen.
 *
 * ## Nothing here decides which account gets linked
 *
 * The widget hands back a payload Telegram signed; this passes it through
 * untouched and the API checks the HMAC before reading an id out of it. So this
 * component cannot link an arbitrary Telegram account even if somebody edits it
 * in the browser — which is the reason it can afford to be a thin wrapper around
 * a third-party script, exactly like `OAuthButtons`.
 *
 * ## Three states, and "Disconnect" does not mean disconnect
 *
 * Not connected / connected with notifications on / connected with them off.
 * The third exists because turning Telegram off deliberately **keeps** the
 * Telegram identity: it is what signs the person back in, and clearing it would
 * mean the next Telegram sign-in created a whole new account (see
 * `TelegramLinkService`). So the button switches messages off and the account
 * stays connected — which is why the copy says "notifications" rather than
 * promising an unlink this does not perform.
 *
 * Telegram also refuses to let a bot open a conversation, so a linked account
 * only actually receives anything once the person has pressed /start in the bot.
 * That is a fact about Telegram rather than stored state, so it is shown as
 * standing guidance beside the "on" state rather than as a fourth mode.
 */
export function TelegramConnection({ initial }: { initial: TelegramStatus }) {
  const { t } = useI18n();
  const [status, setStatus] = React.useState(initial);
  const [busy, setBusy] = React.useState<'connecting' | 'disconnecting' | 'enabling' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<'connected' | 'disconnected' | 'enabled' | null>(null);
  const slot = React.useRef<HTMLDivElement>(null);

  const connect = React.useCallback(
    async (payload: TelegramWidgetPayload) => {
      setBusy('connecting');
      setError(null);
      setDone(null);
      try {
        const next = await browserFetch<TelegramStatus>('/users/me/telegram/connect', {
          method: 'POST',
          body: payload,
        });
        setStatus(next);
        setDone('connected');
      } catch (problem) {
        /*
         * 409 is the case worth naming. It means the Telegram account belongs to
         * a different FotSpot account — so the message has to say what to do
         * about it, or somebody presses Connect repeatedly wondering why it will
         * not take. Everything else falls back to a generic failure.
         */
        setError(
          problem instanceof ApiError && problem.status === 409
            ? t.telegram.alreadyConnected
            : t.telegram.connectFailed,
        );
      } finally {
        setBusy(null);
      }
    },
    [t],
  );

  async function setNotifications(enabled: boolean) {
    setBusy(enabled ? 'enabling' : 'disconnecting');
    setError(null);
    setDone(null);
    try {
      const next = await browserFetch<TelegramStatus>('/users/me/telegram', {
        method: 'PATCH',
        body: { notificationsEnabled: enabled },
      });
      setStatus(next);
      setDone(enabled ? 'enabled' : 'disconnected');
    } catch {
      setError(enabled ? t.telegram.enableFailed : t.telegram.disconnectFailed);
    } finally {
      setBusy(null);
    }
  }

  /*
   * The Telegram widget, mounted only while disconnected.
   *
   * It calls a *named global* rather than taking a function, so the handler has
   * to be parked on `window` and taken down again — the same arrangement as
   * `OAuthButtons`, and for the same reason. A distinct global name so the two
   * cannot overwrite each other if a future screen renders both: signing in and
   * linking do very different things with the same payload.
   */
  React.useEffect(() => {
    if (!TELEGRAM_BOT || status.connected || !slot.current) return;
    const mount = slot.current;

    // The widget's payload is `Record<string, string>`; the server is what
    // validates its shape, so this only narrows the type for the call.
    window.onTelegramConnect = (user) => void connect(user as unknown as TelegramWidgetPayload);

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', TELEGRAM_BOT);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '8');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-onauth', 'onTelegramConnect(user)');
    mount.appendChild(script);

    return () => {
      delete window.onTelegramConnect;
      mount.replaceChildren();
    };
  }, [connect, status.connected]);

  // A section offering a button that cannot work is worse than no section — the
  // same judgement `OAuthButtons` makes about an unconfigured provider.
  if (!TELEGRAM_BOT) return null;

  const botLink = `https://t.me/${status.botUsername ?? TELEGRAM_BOT}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="text-primary size-4" aria-hidden /> {t.telegram.title}
        </CardTitle>
        <CardDescription>
          {status.connected ? t.telegram.connected : t.telegram.notConnected}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}

        {done === 'connected' && (
          <Alert tone="success">
            <span className="flex items-center gap-2">
              <Check className="size-4" aria-hidden /> {t.telegram.connectSuccess}
            </span>
          </Alert>
        )}
        {done === 'disconnected' && <Alert tone="success">{t.telegram.disconnectSuccess}</Alert>}
        {done === 'enabled' && <Alert tone="success">{t.telegram.enableSuccess}</Alert>}

        {!status.connected && (
          <>
            <p className="text-muted text-sm">{t.telegram.connectHint}</p>
            {/* The widget renders its own button in here, so this owns layout
                only. `aria-busy` sits on the wrapper because a press hands off
                to a Telegram popup and there is nothing of ours to disable. */}
            <div ref={slot} className="flex justify-center" aria-busy={busy === 'connecting'} />
          </>
        )}

        {status.connected && (
          <>
            <p className="flex items-center gap-2 text-sm font-medium">
              {t.telegram.notificationsLabel}:{' '}
              <span className={status.notificationsEnabled ? 'text-success' : 'text-muted'}>
                {status.notificationsEnabled ? t.telegram.on : t.telegram.off}
              </span>
            </p>

            {status.notificationsEnabled && (
              /*
               * Standing guidance, not an error. Telegram will not let the bot
               * open a conversation, so somebody who has never pressed /start
               * receives nothing however this setting reads — and there is no
               * stored state that says which of those they are.
               */
              <Alert tone="warning">
                <p>{t.telegram.startBotHint}</p>
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <a href={botLink} target="_blank" rel="noopener noreferrer">
                    {t.telegram.openBot}
                  </a>
                </Button>
              </Alert>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setNotifications(!status.notificationsEnabled)}
              disabled={busy !== null}
              className="w-full"
            >
              {busy === 'disconnecting'
                ? t.telegram.disconnecting
                : busy === 'enabling'
                  ? t.telegram.enabling
                  : status.notificationsEnabled
                    ? t.telegram.disable
                    : t.telegram.enable}
            </Button>

            {/* The identity stays whatever this setting says — so the screen
                says so, rather than letting "Disable" imply an unlink. */}
            <p className="text-muted text-xs">{t.telegram.identityKeptHint}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

declare global {
  interface Window {
    /** Distinct from `onTelegramAuth`, which signs in — see the effect above. */
    onTelegramConnect?: (user: Record<string, string>) => void;
  }
}
