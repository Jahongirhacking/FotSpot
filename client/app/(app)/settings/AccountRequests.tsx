'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, Send } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { cn, formatDate } from '@/lib/utils';

type RequestType = 'DELETE_ACCOUNT' | 'FEEDBACK' | 'BUG' | 'OTHER';

/**
 * The three a person can raise from this screen.
 *
 * `OTHER` exists in the API and is deliberately not offered here: a fourth tab
 * called "other" is where every request goes when the first three are not read
 * carefully, and an inbox of untyped messages is harder to work than three
 * named queues.
 */
const REQUEST_KINDS = ['FEEDBACK', 'BUG', 'DELETE_ACCOUNT'] as const;
type RequestKind = (typeof REQUEST_KINDS)[number];
type RequestStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'DECLINED';

interface MyRequest {
  id: string;
  type: RequestType;
  status: RequestStatus;
  createdAt: string;
}

/**
 * Asking the team to delete the account, and anything else there is no button for.
 *
 * ## Why a request and not a delete button
 *
 * Erasure is irreversible, it is precisely what a stolen session would press, and
 * the person asking often wants something narrower — take that clip down, hide me
 * from search — which a conversation finds and a button never asks about. On a
 * platform whose users are children, the slower path is the right one, and the
 * privacy policy describes exactly this.
 *
 * The screen's job is therefore to make the promise visible: send it, see that it
 * is in hand, and be told what happens next.
 */
export function AccountRequests() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  /**
   * Which kind of request is being written, and the note for it.
   *
   * Three buttons under one shared box asked the reader to write first and
   * choose after, which is the wrong way round — and the note they had typed
   * for a bug report went out attached to whichever button they happened to
   * press. Choosing first makes the box mean something.
   *
   * The notes are kept per kind rather than cleared on every switch: somebody
   * who starts a bug report, glances at the deletion tab and comes back should
   * find their paragraph still there. Only the sent one is cleared.
   */
  const [kind, setKind] = React.useState<RequestKind>('FEEDBACK');
  const [notes, setNotes] = React.useState<Record<RequestKind, string>>({
    FEEDBACK: '',
    BUG: '',
    DELETE_ACCOUNT: '',
  });
  const message = notes[kind];
  const setMessage = (next: string) => setNotes((current) => ({ ...current, [kind]: next }));
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const mine = useQuery({
    queryKey: ['my-support-requests'],
    queryFn: () => browserFetch<MyRequest[]>('/requests/mine'),
  });

  const send = useMutation({
    mutationFn: (type: RequestKind) =>
      browserFetch<{ alreadyOpen: boolean }>('/requests', {
        method: 'POST',
        body: { type, message: notes[type].trim() || undefined },
      }),
    onSuccess: (result, type) => {
      setError(null);
      // Only the one that went out — the other tabs keep their drafts.
      setNotes((current) => ({ ...current, [type]: '' }));
      // Pressing twice is not asking twice — the API returns the open request
      // rather than filing a second, and the wording follows suit.
      setNotice(result?.alreadyOpen ? t.requests?.askAlreadyOpen : t.requests?.askSent);
      void queryClient.invalidateQueries({ queryKey: ['my-support-requests'] });
    },
    onError: (problem: Error) => {
      setNotice(null);
      setError(problem?.message);
    },
  });

  const open = (mine.data ?? []).filter(
    (request) => request?.status === 'NEW' || request?.status === 'IN_PROGRESS',
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LifeBuoy className="text-primary size-4" aria-hidden />
          {t.requests?.askTitle}
        </CardTitle>
        <CardDescription>{t.requests?.askDeleteBody}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {notice && <Alert tone="success">{notice}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}

        {open.length > 0 && (
          <ul className="space-y-1.5 text-sm">
            {open.map((request) => (
              <li key={request?.id} className="flex flex-wrap items-center gap-2">
                <Badge variant={request?.status === 'NEW' ? 'warning' : 'info'}>
                  {t.requests?.[`status${request?.status}`]}
                </Badge>
                <span>{t.requests?.[`type${request?.type}`]}</span>
                <span className="text-muted text-xs">{formatDate(request?.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Choose what this is about, then write it.
            A tab rather than a button per kind: the note underneath belongs to
            one of them, and with three send buttons over a shared box there was
            no way to see which. */}
        <div role="tablist" className="bg-surface-2 grid grid-cols-3 gap-1 rounded-lg p-1">
          {REQUEST_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={option === kind}
              onClick={() => setKind(option)}
              className={cn(
                'min-h-10 rounded-md px-2 text-sm font-medium transition-colors',
                option === kind ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
                // The deletion tab reads as what it is once selected, without
                // being shouted at from the strip when it is not.
                option === kind && option === 'DELETE_ACCOUNT' && 'text-danger',
              )}
            >
              {option === 'DELETE_ACCOUNT'
                ? t.requests?.askDeleteTitle
                : t.requests?.[`type${option}`]}
            </button>
          ))}
        </div>

        {/* Said only on the tab it applies to. The policy names deletion as a
            right, so it is offered plainly rather than hidden — but nobody
            should arrive at it without reading what it does. */}
        {kind === 'DELETE_ACCOUNT' && <Alert tone="warning">{t.requests?.askDeleteBody}</Alert>}

        <Field
          label={t.requests?.askMessageLabel}
          htmlFor="request-message"
          hint={t.requests?.askMessagePlaceholder}
        >
          <Textarea
            id="request-message"
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t.requests?.askMessagePlaceholder}
          />
        </Field>

        {/* One action, so its spinner can only mean one thing. */}
        <Button
          size="sm"
          variant={kind === 'DELETE_ACCOUNT' ? 'danger' : 'primary'}
          loading={send.isPending}
          onClick={() => send.mutate(kind)}
        >
          <Send aria-hidden /> {t.requests?.send}
        </Button>
      </CardContent>
    </Card>
  );
}
