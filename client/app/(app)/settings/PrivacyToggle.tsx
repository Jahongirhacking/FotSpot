'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { EyeOff } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import { useI18n } from '@/components/layout/I18nProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';

/**
 * Hide the account from search, listings and public profile reads.
 *
 * Off by default, and the copy says what it costs: an account nobody can find
 * cannot be scouted, which is the entire point of being here. The switch exists
 * because a fourteen-year-old's guardian may reasonably want it anyway.
 *
 * Optimistic, and reverted on failure — a switch that lags behind the finger
 * reads as broken, and this one has no destructive outcome to be careful about.
 */
export function PrivacyToggle({ initial }: { initial: boolean }) {
  const { t } = useI18n();
  const [isPrivate, setIsPrivate] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);

  const save = useMutation({
    mutationFn: (next: boolean) =>
      browserFetch('/users/me', { method: 'PATCH', body: { isPrivate: next } }),
    onError: (err: Error) => {
      setIsPrivate(!isPrivate);
      setError(err.message);
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <EyeOff className="text-muted size-4" aria-hidden /> {t.profile.privateProfile}
          </CardTitle>
          <CardDescription>{t.profile.privateProfileHint}</CardDescription>
        </div>

        <label className="flex shrink-0 cursor-pointer items-center gap-2">
          <span className="sr-only">{t.profile.privateProfile}</span>
          <input
            type="checkbox"
            role="switch"
            checked={isPrivate}
            disabled={save.isPending}
            onChange={(event) => {
              setError(null);
              setIsPrivate(event.target.checked);
              save.mutate(event.target.checked);
            }}
            className="peer sr-only"
          />
          <span className="bg-surface-3 peer-checked:bg-primary peer-focus-visible:ring-ring relative h-6 w-11 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2">
            <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
          </span>
        </label>
      </CardHeader>
      {error && (
        <CardContent>
          <Alert tone="danger">{error}</Alert>
        </CardContent>
      )}
    </Card>
  );
}
