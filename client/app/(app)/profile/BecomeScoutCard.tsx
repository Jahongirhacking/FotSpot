'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import { refreshSession } from '@/lib/api/session-refresh';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';

/**
 * Offers the scout role to a player who does not hold it.
 *
 * Scouting is the one role a user can take for themselves, because it starts with
 * no authority: a new scout's recommendation carries the lowest §1.5 weight and
 * only earns more when academies accept it. Nothing is risked by letting someone
 * try.
 *
 * A client island because granting a role has to be followed by a session
 * refresh — `roles` is a login-time claim (backend/CLAUDE.md §7), so without one
 * the new role is invisible to the switcher and to every scout-only screen.
 */
export function BecomeScoutCard() {
  const { t } = useI18n();
  const [error, setError] = React.useState<string | null>(null);

  const become = useMutation({
    mutationFn: async () => {
      await browserFetch('/users/me/roles/scout', { method: 'POST' });
      await refreshSession();
    },
    // Hard navigation: the server layout has to re-read the roles cookie before
    // the switcher can offer the new role.
    onSuccess: () => window.location.assign('/profile'),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Card className="border-primary/30">
      {error && (
        <div className="p-5 pb-0">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <Search className="text-primary size-4" aria-hidden /> {t.profile.becomeScout}
          </p>
          <p className="text-muted mt-0.5 text-sm">{t.profile.becomeScoutHint}</p>
        </div>
        <Button size="sm" loading={become.isPending} onClick={() => become.mutate()}>
          {t.profile.becomeScoutCta}
        </Button>
      </CardContent>
    </Card>
  );
}
