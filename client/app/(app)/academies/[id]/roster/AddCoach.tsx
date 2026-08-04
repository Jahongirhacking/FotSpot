'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { ManagerCredentials } from '@/lib/api/resources';
import { useI18n } from '@/components/layout/I18nProvider';
import {
  EMPTY_MANAGER,
  isManagerComplete,
  managerBody,
  ManagerFields,
  type ManagerChoice,
} from '@/components/shared/ManagerFields';
import { CredentialsPanel } from '@/components/shared/CredentialsPanel';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';

/**
 * The manager hires a coach — either an account that already exists, or a new one
 * minted with credentials to hand over.
 *
 * The same two paths, and the same components, as an admin appointing a manager:
 * most youth coaches here are not on the platform yet, so "search for them" alone
 * would strand the majority, while someone who *is* already a scout must not be
 * issued a second identity.
 *
 * A minted account's password exists in exactly one place for exactly one moment,
 * so the panel showing it has to be dismissed rather than fading — see
 * CredentialsPanel.
 */
export function AddCoach({ academyId }: { academyId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [choice, setChoice] = React.useState<ManagerChoice>(EMPTY_MANAGER);
  const [bio, setBio] = React.useState('');
  const [credentials, setCredentials] = React.useState<ManagerCredentials | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      browserFetch<{ credentials?: ManagerCredentials }>(`/academies/${academyId}/coaches`, {
        method: 'POST',
        body,
      }),
    onSuccess: (result) => {
      setCredentials(result.credentials ?? null);
      setChoice(EMPTY_MANAGER);
      setBio('');
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['roster', academyId] });
      void queryClient.invalidateQueries({ queryKey: ['profile-summary'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  // `managerBody` speaks the manager vocabulary; a coach is the same two shapes
  // under different key names.
  function submit() {
    setError(null);
    const body = managerBody(choice);
    create.mutate({
      ...(body.managerUserId ? { userId: body.managerUserId } : {}),
      ...(body.newManager ? { newCoach: body.newManager } : {}),
      ...(bio.trim() ? { bio: bio.trim() } : {}),
    });
  }

  return (
    <div className="space-y-3">
      {credentials && (
        <CredentialsPanel credentials={credentials} onDismiss={() => setCredentials(null)} />
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">{t.academy.addCoach}</CardTitle>
          <Button
            size="sm"
            variant={open ? 'ghost' : 'primary'}
            onClick={() => setOpen((was) => !was)}
          >
            <UserPlus aria-hidden /> {open ? t.common.cancel : t.academy.addCoach}
          </Button>
        </CardHeader>

        {open && (
          <CardContent className="space-y-3">
            <p className="text-muted text-sm">{t.academy.addCoachHint}</p>

            <ManagerFields value={choice} onChange={setChoice} />

            <Field label={t.academy.coachBio} htmlFor="coach-bio">
              <Textarea
                id="coach-bio"
                value={bio}
                maxLength={500}
                onChange={(event) => setBio(event.target.value)}
                placeholder={t.placeholders.note}
              />
            </Field>

            <div className="flex justify-end">
              <Button
                onClick={submit}
                loading={create.isPending}
                disabled={!isManagerComplete(choice)}
              >
                {t.academy.addCoach}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
