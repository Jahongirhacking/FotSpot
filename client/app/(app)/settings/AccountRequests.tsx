'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { formatDate } from '@/lib/utils';

type RequestType = 'DELETE_ACCOUNT' | 'FEEDBACK' | 'BUG' | 'OTHER';
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
  const [message, setMessage] = React.useState('');
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const mine = useQuery({
    queryKey: ['my-support-requests'],
    queryFn: () => browserFetch<MyRequest[]>('/requests/mine'),
  });

  const send = useMutation({
    mutationFn: (type: RequestType) =>
      browserFetch<{ alreadyOpen: boolean }>('/requests', {
        method: 'POST',
        body: { type, message: message.trim() || undefined },
      }),
    onSuccess: (result) => {
      setError(null);
      setMessage('');
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

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            loading={send.isPending}
            onClick={() => send.mutate('FEEDBACK')}
          >
            {t.requests?.typeFEEDBACK}
          </Button>
          <Button
            size="sm"
            variant="outline"
            loading={send.isPending}
            onClick={() => send.mutate('BUG')}
          >
            {t.requests?.typeBUG}
          </Button>
          {/* Deliberately last and visually distinct, but not hidden: the policy
              names it as a right, and a right buried behind a support email is
              one most people never exercise. */}
          <Button
            size="sm"
            variant="danger"
            loading={send.isPending}
            onClick={() => send.mutate('DELETE_ACCOUNT')}
          >
            {t.requests?.askDeleteTitle}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
