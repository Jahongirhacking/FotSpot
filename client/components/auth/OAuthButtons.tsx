'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Alert } from '@/components/ui/Feedback';
import * as React from 'react';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? '';

/** The global the Telegram widget calls back into — see `useTelegramWidget`. */
declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, string>) => void;
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

function loadScript(src: string, attrs: Record<string, string> = {}): Promise<HTMLScriptElement> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing && Object.keys(attrs).length === 0) return resolve(existing);

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    for (const [key, value] of Object.entries(attrs)) script.setAttribute(key, value);
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * "Continue with Google" and "Continue with Telegram".
 *
 * ## One button for signing in and signing up
 *
 * There is no separate registration path. The API is handed a verified identity
 * and decides for itself whether it already knows the account — matching a Google
 * account on its verified email and a Telegram account on its Telegram id — so a
 * first-time user is registered and signed in by the same press that signs a
 * returning one back in. Offering "sign up with Google" beside "sign in with
 * Google" would be asking the user a question only the server can answer.
 *
 * ## Neither provider is trusted here
 *
 * Both hand this component something the server then verifies: Google an ID token
 * checked against Google's signing keys, Telegram a payload whose HMAC is checked
 * with the bot token. Nothing in this file decides who anybody is, which is why
 * it can afford to be a thin wrapper around two third-party widgets.
 *
 * A button whose provider is unconfigured is not rendered at all. A dead
 * "Continue with Google" that fails on press is worse than one that was never
 * offered.
 */
export function OAuthButtons({ redirectTo }: { redirectTo?: string }) {
  const { t } = useI18n();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const googleSlot = React.useRef<HTMLDivElement>(null);
  const telegramSlot = React.useRef<HTMLDivElement>(null);

  const submit = React.useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          setError(problem?.message ?? t.auth?.couldNotSignIn);
          setBusy(false);
          return;
        }
        /*
         * A hard navigation, not router.push — the same reason LoginForm does it:
         * the session lives in httpOnly cookies the server layout reads, and a
         * client-side transition would re-render the shell with the old session.
         */
        window.location.assign(
          redirectTo && redirectTo.startsWith('/') ? redirectTo : '/dashboard',
        );
      } catch {
        setError(t.auth?.couldNotSignIn);
        setBusy(false);
      }
    },
    [redirectTo, t],
  );

  // ---- Google Identity Services ----
  React.useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleSlot.current) return;
    let cancelled = false;

    loadScript('https://accounts.google.com/gsi/client')
      .then(() => {
        if (cancelled || !googleSlot.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response: { credential?: string }) => {
            if (response?.credential) void submit({ mode: 'google', idToken: response.credential });
          },
        });
        window.google.accounts.id.renderButton(googleSlot.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          // Google renders at a fixed pixel width, so it is told the container's
          // rather than being left to overflow a phone.
          width: googleSlot.current.clientWidth || 320,
          locale: t.common?.language === 'Til' ? 'uz' : undefined,
        });
      })
      .catch(() => setError(t.auth?.couldNotSignIn));

    return () => {
      cancelled = true;
    };
  }, [submit, t]);

  // ---- Telegram Login Widget ----
  React.useEffect(() => {
    if (!TELEGRAM_BOT || !telegramSlot.current) return;
    const slot = telegramSlot.current;

    // The widget calls a *named global* rather than taking a function, so the
    // handler has to be parked on `window` and taken down again on unmount.
    window.onTelegramAuth = (user) => void submit({ mode: 'telegram', ...user });

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', TELEGRAM_BOT);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '8');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    slot.appendChild(script);

    return () => {
      delete window.onTelegramAuth;
      slot.replaceChildren();
    };
  }, [submit]);

  if (!GOOGLE_CLIENT_ID && !TELEGRAM_BOT) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="bg-border h-px flex-1" />
        <span className="text-muted text-xs uppercase">{t.auth?.orContinueWith}</span>
        <span className="bg-border h-px flex-1" />
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {/* The providers render their own buttons into these, so the wrappers only
          own layout. `aria-busy` is on the group because a press hands off to a
          third-party popup and there is nothing of ours to disable. */}
      <div className="flex flex-col items-stretch gap-2" aria-busy={busy}>
        {GOOGLE_CLIENT_ID && <div ref={googleSlot} className="[&>div]:!w-full" />}
        {TELEGRAM_BOT && <div ref={telegramSlot} className="flex w-full justify-center" />}
      </div>
    </div>
  );
}
