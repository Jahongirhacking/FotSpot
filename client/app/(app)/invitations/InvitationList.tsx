'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, MailOpen, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { browserFetch } from '@/lib/api/browser';
import type { MyInvitation } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Field, Textarea } from '@/components/ui/Field';
import { relativeTime } from '@/lib/utils';

/** How long the Undo stays on screen. The API allows a little longer. */
const UNDO_TOAST_MS = 8_000;

/**
 * The invitations addressed to this account, and the answer to each.
 *
 * ## Accept is one press, and undoable
 *
 * A yes is recorded at once, and the API acts on it — the membership, the
 * manager's notification — only after a short window; the toast that confirms
 * the press carries Undo for that window, and Undo is a real call that returns
 * the invitation to unanswered. So there is no "are you sure?" in front of
 * the button: the way back is after it, where a mis-tap is actually noticed.
 *
 * ## Turning down asks first, and lets them say why
 *
 * A no is final and reaches the manager, so it opens a small dialog with an
 * optional note — a sentence the manager reads in their notification. It is
 * optional because saying no must stay cheap.
 */
export function InvitationList({ initial }: { initial: MyInvitation[] }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [answered, setAnswered] = React.useState<string | null>(null);
  const [declining, setDeclining] = React.useState<MyInvitation | null>(null);

  const list = useQuery({
    queryKey: ['invitations', 'mine'],
    queryFn: () => browserFetch<MyInvitation[]>('/academies/invitations/mine'),
    initialData: initial,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['invitations'] });
    void queryClient.invalidateQueries({ queryKey: ['profile-summary'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const undo = useMutation({
    mutationFn: (id: string) =>
      browserFetch<MyInvitation>(`/academies/invitations/${id}/undo`, { method: 'POST' }),
    onSuccess: () => {
      setAnswered(null);
      refresh();
    },
    meta: { success: t.invitations.undone },
  });

  const accept = useMutation({
    mutationFn: (id: string) =>
      browserFetch<MyInvitation>(`/academies/invitations/${id}/accept`, { method: 'POST' }),
    onSuccess: (_result, id) => {
      setAnswered(t.invitations.acceptedNote);
      refresh();
      toast.success(t.invitations.acceptedToast, {
        duration: UNDO_TOAST_MS,
        action: { label: t.common.undo, onClick: () => undo.mutate(id) },
      });
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      browserFetch<MyInvitation>(`/academies/invitations/${id}/reject`, {
        method: 'POST',
        body: note ? { note } : {},
      }),
    onSuccess: () => {
      setDeclining(null);
      setAnswered(null);
      refresh();
    },
    meta: { success: t.invitations.rejectedToast },
  });

  const invitations = list.data ?? [];

  if (invitations?.length === 0) {
    return (
      <EmptyState
        icon={MailOpen}
        title={t.invitations.empty}
        description={t.invitations.emptyHint}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Accepting is not the end of it — say where they have landed, or the
          next question is "so am I in the team or not?". */}
      {answered && <Alert tone="success">{answered}</Alert>}

      <ul className="space-y-3">
        {invitations?.map((invitation) => {
          const pending = invitation?.status === 'PENDING';
          const busy =
            (accept.isPending && accept.variables === invitation?.id) ||
            (undo.isPending && undo.variables === invitation?.id);

          return (
            <li key={invitation?.id}>
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    {/* Same convention as CurrentSquadCard: an institution gets
                        the building, a neighbourhood team gets the people. The
                        badge beside the name says which in words, because the
                        icon alone is a distinction only a regular reader would
                        pick up (LOCAL_TEAM.md §20). */}
                    {invitation?.academy.kind === 'LOCAL_TEAM' ? (
                      <Users className="text-muted mt-0.5 size-5 shrink-0" aria-hidden />
                    ) : (
                      <Building2 className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/academies/${invitation?.academy.id}`}
                          className="truncate font-medium hover:underline"
                        >
                          {invitation?.academy.name}
                        </Link>
                        {invitation?.academy.kind === 'LOCAL_TEAM' && (
                          <Badge variant="neutral">{t.academy?.localTeam}</Badge>
                        )}
                      </p>
                      <p className="text-muted truncate text-sm">
                        {[invitation?.academy?.district, invitation?.academy?.region]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <p className="text-muted mt-1 text-xs">
                        {t.invitations.invitedAs}:{' '}
                        {t.roles?.[invitation?.role?.toLowerCase() as 'coach'] ?? invitation?.role}{' '}
                        · {relativeTime(invitation?.createdAt)}
                      </p>
                    </div>

                    {!pending && (
                      <Badge variant={invitation?.status === 'ACCEPTED' ? 'success' : 'neutral'}>
                        {invitation?.status === 'ACCEPTED'
                          ? t.invitations.accepted
                          : invitation?.status === 'REJECTED'
                            ? t.invitations.rejected
                            : t.invitations.cancelled}
                      </Badge>
                    )}
                  </div>

                  {invitation?.note && (
                    <p className="bg-surface-2 rounded-lg p-3 text-sm">{invitation?.note}</p>
                  )}

                  {/* What they said when turning it down — shown back to them,
                      as the manager sees it. */}
                  {invitation?.status === 'REJECTED' && invitation?.answerNote && (
                    <p className="text-muted text-sm">— {invitation.answerNote}</p>
                  )}

                  {pending && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setDeclining(invitation)}
                      >
                        <X aria-hidden /> {t.invitations.reject}
                      </Button>
                      <Button
                        size="sm"
                        loading={busy}
                        onClick={() => accept.mutate(invitation?.id)}
                      >
                        <Check aria-hidden /> {t.invitations.accept}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <DeclineDialog
        invitation={declining}
        pending={reject.isPending}
        onOpenChange={(open) => {
          if (!open) setDeclining(null);
        }}
        onConfirm={(note) => {
          if (declining) reject.mutate({ id: declining.id, note });
        }}
      />
    </div>
  );
}

/**
 * "Turn down this invitation?" — with a line for the manager, if wanted.
 */
function DeclineDialog({
  invitation,
  pending,
  onOpenChange,
  onConfirm,
}: {
  invitation: MyInvitation | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note?: string) => void;
}) {
  const { t, f } = useI18n();
  const [note, setNote] = React.useState('');

  return (
    <Dialog
      open={invitation !== null}
      onOpenChange={(next) => {
        if (!next) setNote('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.invitations.confirmReject}</DialogTitle>
          <DialogDescription>
            {f(t.invitations.rejectDialogBody, { academy: invitation?.academy.name ?? '' })}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Field label={t.invitations.rejectNote} htmlFor="decline-note">
            <Textarea
              id="decline-note"
              value={note}
              rows={3}
              maxLength={500}
              autoFocus
              onChange={(event) => setNote(event.target.value)}
              placeholder={t.invitations.rejectNotePlaceholder}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() => {
              const trimmed = note.trim();
              setNote('');
              onConfirm(trimmed || undefined);
            }}
          >
            <X aria-hidden /> {t.invitations.reject}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
