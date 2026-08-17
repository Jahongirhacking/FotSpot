'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, Trash2 } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { formatDateTime } from '@/lib/utils';

type RequestType = 'DELETE_ACCOUNT' | 'FEEDBACK' | 'BUG' | 'OTHER';
type RequestStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'DECLINED';

interface SupportRequest {
  id: string;
  type: RequestType;
  status: RequestStatus;
  message: string | null;
  handledNote: string | null;
  handledAt: string | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    email: string | null;
    phone: string | null;
    isActive: boolean;
  } | null;
  handledBy: { id: string; firstName: string | null; lastName: string | null } | null;
}

const STATUS_TONE = {
  NEW: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
  DECLINED: 'danger',
} as const satisfies Record<RequestStatus, 'warning' | 'info' | 'success' | 'danger'>;

/**
 * The queue an admin works from.
 *
 * ## Contact details are on the row
 *
 * The whole workflow is "get in touch with this person, then act". An admin who
 * has to open a second screen to find an email address is an admin who will
 * close the request without writing to anybody, so the address and the phone
 * number are here and are click-to-send.
 *
 * ## Closing one needs a note
 *
 * The API refuses to resolve or decline without it, and the form says so before
 * the request rather than after. "Resolved", with no record of what was actually
 * done, is the state that makes a later complaint unanswerable — and for a
 * deletion request, unanswerable is exactly the wrong outcome.
 */
export function RequestQueue({ canDelete }: { canDelete: boolean }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const queue = useQuery({
    queryKey: ['support-requests'],
    queryFn: () =>
      browserFetch<{ items: SupportRequest[]; total: number }>('/requests?pageSize=50'),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['support-requests'] });
    // The navbar badge counts NEW, so acting on one has to move it too.
    void queryClient.invalidateQueries({ queryKey: ['support-requests-new'] });
  };

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RequestStatus }) =>
      browserFetch(`/requests/${id}`, {
        method: 'PATCH',
        body: { status, handledNote: notes[id]?.trim() || undefined },
      }),
    onSuccess: refresh,
    onError: (problem: Error) => setError(problem?.message),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => browserFetch(`/admin/users/${userId}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (problem: Error) => setError(problem?.message),
  });

  /*
   * Which button is actually working.
   *
   * One mutation serves every button on every row, so `update.isPending` is true
   * for all of them at once — pressing "Resolve" on one request put a spinner on
   * "Take" and "Decline" too, and on every other request in the queue. It reads
   * as the whole page having been submitted.
   *
   * `variables` is what the mutation was called with and is defined while it is
   * in flight, so the row and the status it carries identify the one button that
   * was pressed. No extra state to keep in step with the request.
   */
  const isUpdating = (id: string, status: RequestStatus) =>
    update.isPending && update.variables?.id === id && update.variables?.status === status;

  if (queue.isLoading) return <p className="text-muted text-sm">{t.common?.loading}</p>;
  if (queue.isError) return <Alert tone="danger">{t.common?.couldNotLoad}</Alert>;

  const items = queue.data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState icon={Mail} title={t.requests?.empty} description={t.admin.noRequestsHint} />
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      {items.map((request) => {
        const person = request?.user;
        const name =
          [person?.firstName, person?.lastName].filter(Boolean).join(' ') ||
          person?.username ||
          '—';
        const open = request?.status === 'NEW' || request?.status === 'IN_PROGRESS';

        return (
          <Card key={request?.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_TONE[request?.status] ?? 'default'}>
                      {t.requests?.[`status${request?.status}`]}
                    </Badge>
                    <span className="font-medium">{t.requests?.[`type${request?.type}`]}</span>
                  </div>
                  <p className="text-muted mt-1 text-xs">
                    {t.requests?.sent}: {formatDateTime(request?.createdAt)}
                  </p>
                </div>
              </div>

              {/* Name, email and phone together: this is what the admin needs to
                  make contact, which is the step before any action. */}
              <div className="border-border bg-surface-2/50 space-y-1.5 rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {person?.id ? (
                    <Link href={`/admin/users/${person?.id}`} className="hover:underline">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                  {person?.username && (
                    <span className="text-muted font-normal"> · @{person?.username}</span>
                  )}
                </p>
                <p className="text-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  {person?.email && (
                    <a
                      href={`mailto:${person?.email}`}
                      className="hover:text-primary inline-flex items-center gap-1"
                    >
                      <Mail className="size-3.5" aria-hidden /> {person?.email}
                    </a>
                  )}
                  {person?.phone && (
                    <a
                      href={`tel:${person?.phone}`}
                      className="hover:text-primary inline-flex items-center gap-1"
                    >
                      <Phone className="size-3.5" aria-hidden /> {person?.phone}
                    </a>
                  )}
                </p>
              </div>

              {request?.message && (
                <p className="text-sm leading-relaxed whitespace-pre-line">{request?.message}</p>
              )}

              {open ? (
                <div className="space-y-2">
                  <Field label={t.requests?.noteLabel} htmlFor={`note-${request?.id}`}>
                    <Textarea
                      id={`note-${request?.id}`}
                      rows={2}
                      placeholder={t.requests?.notePlaceholder}
                      value={notes[request?.id] ?? ''}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [request?.id]: event.target.value }))
                      }
                    />
                  </Field>

                  <div className="flex flex-wrap gap-2">
                    {request?.status === 'NEW' && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={isUpdating(request?.id, 'IN_PROGRESS')}
                        onClick={() => update.mutate({ id: request?.id, status: 'IN_PROGRESS' })}
                      >
                        {t.requests?.take}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      loading={isUpdating(request?.id, 'RESOLVED')}
                      onClick={() => update.mutate({ id: request?.id, status: 'RESOLVED' })}
                    >
                      {t.requests?.resolve}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={isUpdating(request?.id, 'DECLINED')}
                      onClick={() => update.mutate({ id: request?.id, status: 'DECLINED' })}
                    >
                      {t.requests?.decline}
                    </Button>

                    {/* Only a super admin, only on a deletion request, and only
                        after a confirm: it cascades to the card, the clips and
                        the stored files, and there is no undo. */}
                    {canDelete && request?.type === 'DELETE_ACCOUNT' && person?.id && (
                      <Button
                        size="sm"
                        variant="danger"
                        loading={remove.isPending && remove.variables === person?.id}
                        onClick={() => {
                          if (window.confirm(`${t.requests?.typeDELETE_ACCOUNT}: ${name}?`)) {
                            remove.mutate(person?.id);
                          }
                        }}
                      >
                        <Trash2 aria-hidden /> {t.requests?.typeDELETE_ACCOUNT}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-muted text-xs">
                  {request?.handledNote}
                  {request?.handledBy && (
                    <>
                      {' · '}
                      {t.requests?.handledBy}:{' '}
                      {[request?.handledBy?.firstName, request?.handledBy?.lastName]
                        .filter(Boolean)
                        .join(' ')}
                    </>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
