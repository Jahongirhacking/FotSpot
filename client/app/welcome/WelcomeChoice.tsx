'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, Volleyball, ArrowRight } from 'lucide-react';
import { Alert } from '@/components/ui/Feedback';
import { browserFetch } from '@/lib/api/browser';
import { refreshSession } from '@/lib/api/session-refresh';
import { cn } from '@/lib/utils';

/**
 * Two choices, and the answer is what grants a role — README §1.2.2.
 *
 * This used to be decorative. Signup handed everyone `scout`, so both buttons led
 * to the same place and only wrote a cookie; "become a scout" could never be
 * offered because you already were one. Now a new account holds no role at all
 * and leaves here holding exactly the one it picked.
 *
 * There is no skip. With no role the app has no home screen to send you to, and a
 * question you cannot avoid is kinder than a dashboard that does not work. Both
 * roles remain addable later from the profile — roles accumulate (§1.2).
 *
 * "I play" grants nothing here: the backend attaches `player` when the profile is
 * created, because §11.1 requires the age gate to come first.
 */
export function WelcomeChoice({ alreadyPlayer }: { alreadyPlayer: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<null | 'player' | 'scout'>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function choose(intent: 'player' | 'scout') {
    setBusy(intent);
    setError(null);

    if (intent === 'player') {
      if (alreadyPlayer) {
        await persist({ role: 'player', onboarded: true });
        router.push('/dashboard');
        return;
      }
      // The role arrives with the profile; the wizard is the next step.
      markOnboarded();
      router.push('/onboarding/player');
      return;
    }

    try {
      await browserFetch('/users/me/roles/scout', { method: 'POST' });
      // The JWT is a login-time snapshot (backend/CLAUDE.md §7), so the new role
      // is invisible until the session is refreshed — without this the switcher
      // and every scout-only screen would behave as if nothing happened.
      await refreshSession();
      await persist({ role: 'scout', onboarded: true });
      // Hard navigation: the server layout must re-read the new roles cookie.
      window.location.assign('/dashboard');
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : 'That did not work. Please try again.');
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceCard
          icon={Volleyball}
          title="I play football"
          points={[
            'Build your player card',
            'Add clips of what you can do',
            'Apply for academy trials',
          ]}
          cta="Set up my card"
          loading={busy === 'player'}
          disabled={busy !== null}
          onClick={() => choose('player')}
          highlight
        />

        <ChoiceCard
          icon={Search}
          title="I spot talent"
          points={[
            'Recommend players to academies',
            'Build a scouting reputation',
            'Follow players and academies',
          ]}
          cta="Start scouting"
          loading={busy === 'scout'}
          disabled={busy !== null}
          onClick={() => choose('scout')}
        />
      </div>

      <p className="text-muted text-center text-xs">
        You can add the other one later from your profile.
      </p>
    </div>
  );
}

async function persist(body: { role: string; onboarded: boolean }) {
  await fetch('/api/auth/active-role', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

/** Records that the question was answered, without claiming a role yet. */
function markOnboarded() {
  void fetch('/api/auth/onboarded', { method: 'POST' }).catch(() => undefined);
}

function ChoiceCard({
  icon: Icon,
  title,
  points,
  cta,
  onClick,
  loading,
  disabled,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  points: string[];
  cta: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'bg-surface rounded-card group flex flex-col gap-4 border p-5 text-left transition-all',
        'hover:border-primary hover:shadow-md disabled:opacity-60',
        highlight ? 'border-primary/40' : 'border-border',
      )}
    >
      <div
        className={cn(
          'grid size-12 place-items-center rounded-xl',
          highlight ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-primary',
        )}
      >
        <Icon className="size-6" aria-hidden />
      </div>

      <div className="flex-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <ul className="text-muted mt-2 space-y-1 text-sm">
          {points.map((point) => (
            <li key={point} className="flex gap-1.5">
              <span aria-hidden className="text-primary">
                •
              </span>
              {point}
            </li>
          ))}
        </ul>
      </div>

      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-sm font-medium',
          highlight ? 'text-primary' : 'text-foreground',
        )}
      >
        {loading ? 'Setting up…' : cta}
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </button>
  );
}
