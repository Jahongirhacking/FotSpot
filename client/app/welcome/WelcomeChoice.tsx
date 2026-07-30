'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, Volleyball, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/**
 * Two big choices and a free skip — README §1.2.2.
 *
 * "I play" does not replace the scout role, it adds the player one: roles accumulate
 * (§1.2). Skipping is non-terminal — the dashboard keeps a dismissible card, and the
 * question returns just-in-time when the user tries something player-only.
 */
export function WelcomeChoice({ alreadyPlayer }: { alreadyPlayer: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<null | 'player' | 'scout' | 'skip'>(null);

  async function choose(intent: 'player' | 'scout' | 'skip') {
    setBusy(intent);

    if (intent === 'player') {
      // Mark onboarding answered, but don't set the player role here — the backend
      // grants it when the profile is created, and §11.1 requires age-gating first.
      await persist({ role: 'scout', onboarded: true });
      router.push(alreadyPlayer ? '/dashboard' : '/onboarding/player');
      return;
    }

    await persist({ role: 'scout', onboarded: true });
    router.push('/dashboard');
  }

  return (
    <div className="space-y-4">
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

      <div className="text-center">
        <Button
          variant="ghost"
          onClick={() => choose('skip')}
          loading={busy === 'skip'}
          disabled={busy !== null}
        >
          I&apos;ll decide later
        </Button>
      </div>
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
