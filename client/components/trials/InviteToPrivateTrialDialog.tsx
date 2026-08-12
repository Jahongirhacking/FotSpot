'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyProfile } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { NoteEditor } from './NoteEditor';
import { htmlToMarkdown, markdownToHtml, sanitizeNote } from '@/lib/rich-text';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';

/**
 * The one invitation to a private trial, wherever it is sent from.
 *
 * ## Why it is a dialog, and why it is shared
 *
 * Sending this creates a trial — a real session, on a date, for one named child.
 * That is a decision with three fields behind it, and the two places a manager
 * makes it (the inbox queue and the player's own profile) had grown two separate
 * forms that had already drifted apart: one asked for a date and location, the
 * other posted a note alone and would have been rejected by the API. One
 * component, one shape, one behaviour.
 *
 * Inline, it also turned a list row into a form — three fields deep in a queue
 * the manager is scanning. A dialog keeps the row a row.
 *
 * ## Why the location is prefilled
 *
 * Almost every private trial happens where the academy trains. Typing the same
 * address for each invitation is work the screen can do, and it stays editable
 * for the times it is somewhere else.
 */
export function InviteToPrivateTrialDialog({
  playerId,
  playerName,
  academyId,
  trigger,
  onInvited,
}: {
  playerId: string;
  playerName: string;
  /** Whose academy is inviting — used to prefill the location. */
  academyId?: string;
  /** Defaults to a full-width "Invite" button. */
  trigger?: React.ReactNode;
  onInvited?: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState('');
  const [typedNote, setTypedNote] = React.useState<string | null>(null);
  /**
   * What the manager typed, or null while they have typed nothing.
   *
   * Null rather than the prefilled string, so the academy's address can be
   * *derived* below instead of copied into state by an effect — an effect would
   * either overwrite what somebody was typing or need a second flag to stop it.
   * Clearing the box sets `''`, which is not null, so it stays cleared.
   */
  const [typedLocation, setTypedLocation] = React.useState<string | null>(null);

  const academy = useQuery({
    queryKey: ['academy', academyId],
    queryFn: () => browserFetch<AcademyProfile>(`/academies/${academyId}`),
    enabled: open && Boolean(academyId),
  });

  const defaultLocation = [academy?.data?.district, academy?.data?.region].filter(Boolean).join(', ');

  const location = typedLocation ?? defaultLocation;
  // The academy's default note is the starting point, exactly as it is when a
  // global trial is created — one place to write it, both routes use it.
  const note = typedNote ?? htmlToMarkdown(academy?.data?.defaultTrialNote);

  const invite = useMutation({
    mutationFn: () =>
      browserFetch(`/recommendations/players/${playerId}/invite`, {
        method: 'POST',
        body: {
          date: new Date(date).toISOString(),
          location: location.trim(),
          note: sanitizeNote(markdownToHtml(note)),
        },
      }),
    onSuccess: () => {
      setOpen(false);
      setDate('');
      setTypedNote(null);
      setTypedLocation(null);
      // Everything that renders "has this player been invited": the inbox queue,
      // the player's own panel, and the academy's trial lists — the invitation
      // has just created a private trial that belongs in them.
      void queryClient.invalidateQueries({ queryKey: ['inbox-ranked'] });
      void queryClient.invalidateQueries({ queryKey: ['academy-state', playerId] });
      void queryClient.invalidateQueries({ queryKey: ['trial-history'] });
      onInvited?.();
    },
    meta: { success: t.recommendations.invitationSent },
  });

  const ready = Boolean(date && location.trim() && note.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Mail aria-hidden /> {t.recommendations.invite}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.recommendations.inviteTitle}</DialogTitle>
          <DialogDescription>{t.recommendations.inviteCreatesTrial}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <p className="text-sm font-medium">{playerName}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.trials.examDate} htmlFor="invite-date" required>
              {/* The 24-hour clock comes from `Input` itself — see Field.tsx. */}
              <Input
                id="invite-date"
                type="datetime-local"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </Field>

            <Field label={t.trials.location} htmlFor="invite-location" required>
              <Input
                id="invite-location"
                value={location}
                maxLength={200}
                onChange={(event) => setTypedLocation(event.target.value)}
                placeholder={t.placeholders.district}
                required
              />
            </Field>
          </div>

          <Field
            label={t.recommendations.inviteNote}
            htmlFor="invite-note"
            hint={t.notes.playerNoteHint}
            required
          >
            <NoteEditor
              id="invite-note"
              value={note}
              onChange={setTypedNote}
              rows={4}
              placeholder={t.placeholders.inviteNote}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t.common.cancel}
          </Button>
          <Button loading={invite.isPending} disabled={!ready} onClick={() => invite.mutate()}>
            <Mail aria-hidden /> {t.recommendations.sendInvite}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
