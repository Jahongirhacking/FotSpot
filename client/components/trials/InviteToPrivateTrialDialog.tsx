'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyProfile } from '@/lib/api/types';
import type { InvitePlayerBody } from '@/lib/api/resources';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
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

/** One of the academy's endorsed coaches, as the endorsements endpoint lists them. */
interface EndorsedCoach {
  userId: string;
  user: { id: string; firstName: string | null; lastName: string | null } | null;
}

const coachName = (row: EndorsedCoach) =>
  [row?.user?.firstName, row?.user?.lastName].filter(Boolean).join(' ') || row?.userId.slice(0, 8);

/**
 * The one invitation to a private trial, wherever it is sent from.
 *
 * ## Why it is a dialog, and why it is shared
 *
 * Sending this creates a trial — a real session, on a date, for one named child,
 * run by one coach (TRIAL.md §11). That is a decision with several fields behind
 * it, and the places it is made (the inbox, the player's own profile, the
 * manager's dashboard) must not grow separate forms that drift apart. One
 * component, one shape, one behaviour.
 *
 * Inline, it also turned a list row into a form — five fields deep in a queue
 * the manager is scanning. A dialog keeps the row a row.
 *
 * ## Who is sending it
 *
 * A manager names the coach who will run the session; the API refuses an
 * invitation from a manager that names nobody, so the field is required here
 * and preselected when there is exactly one coach to choose. A coach is the one
 * who will run it — they are assigned by the API whatever is sent — so they are
 * not asked. `role` is what the panel that opened this already knows from the
 * academy-state endpoint; the API decides for itself again on submit.
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
  role = 'MANAGER',
  recommendationId,
  trigger,
  onInvited,
}: {
  playerId: string;
  playerName: string;
  /** Whose academy is inviting — used to prefill the location and list the coaches. */
  academyId?: string;
  /** Whether the sender must name a coach (a manager) or is one. */
  role?: 'MANAGER' | 'COACH';
  /** The recommendation this answers, when the invitation is sent from the inbox. */
  recommendationId?: string;
  /** Defaults to a full-width "Invite" button. */
  trigger?: React.ReactNode;
  onInvited?: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState('');
  const [time, setTime] = React.useState('10:00');
  const [requirements, setRequirements] = React.useState('');
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
  /** Same shape: the chosen coach, or null until the manager picks one. */
  const [chosenCoach, setChosenCoach] = React.useState<string | null>(null);

  const academy = useQuery({
    queryKey: ['academy', academyId],
    queryFn: () => browserFetch<AcademyProfile>(`/academies/${academyId}`),
    enabled: open && Boolean(academyId),
  });

  const asksForCoach = role === 'MANAGER';

  const coaches = useQuery({
    queryKey: ['endorsed-coaches', academyId],
    queryFn: () => browserFetch<EndorsedCoach[]>(`/academies/${academyId}/endorsements?role=COACH`),
    enabled: open && asksForCoach && Boolean(academyId),
  });
  const coachRows = coaches?.data ?? [];
  // One coach is not a choice; the field still shows who it will be.
  const coachUserId = chosenCoach ?? (coachRows.length === 1 ? coachRows[0].userId : '');

  const defaultLocation = [academy?.data?.district, academy?.data?.region]
    .filter(Boolean)
    .join(', ');

  const location = typedLocation ?? defaultLocation;
  // The academy's default note is the starting point, exactly as it is when a
  // global trial is created — one place to write it, both routes use it.
  const note = typedNote ?? htmlToMarkdown(academy?.data?.defaultTrialNote);

  const invite = useMutation({
    mutationFn: () => {
      const body: InvitePlayerBody = {
        // The day and the hour are sent separately so the API can keep the
        // clock as text — see CreateTrialDto — but the date carries both, so a
        // client that only reads `date` still gets the right morning.
        date: new Date(`${date}T${time || '00:00'}`).toISOString(),
        ...(time ? { startTime: time } : {}),
        location: location.trim(),
        note: sanitizeNote(markdownToHtml(note)),
        ...(requirements.trim() ? { requirements: requirements.trim() } : {}),
        ...(asksForCoach && coachUserId ? { coachUserId } : {}),
        ...(recommendationId ? { recommendationId } : {}),
      };
      return browserFetch(`/recommendations/players/${playerId}/invite`, {
        method: 'POST',
        body,
      });
    },
    onSuccess: () => {
      setOpen(false);
      setDate('');
      setTime('10:00');
      setRequirements('');
      setTypedNote(null);
      setTypedLocation(null);
      setChosenCoach(null);
      // Everything that renders "has this player been invited": the inbox queue
      // and its badge, the player's own panel, the academy's trial lists and
      // the coach's queues — the invitation has just created a private trial
      // that belongs in all of them.
      void queryClient.invalidateQueries({ queryKey: ['inbox-ranked'] });
      void queryClient.invalidateQueries({ queryKey: ['inbox-history'] });
      void queryClient.invalidateQueries({ queryKey: ['inbox-count'] });
      void queryClient.invalidateQueries({ queryKey: ['academy-state', playerId] });
      void queryClient.invalidateQueries({ queryKey: ['trial-history'] });
      void queryClient.invalidateQueries({ queryKey: ['trials', 'coaching'] });
      onInvited?.();
    },
    meta: { success: t.recommendations.invitationSent },
  });

  const ready = Boolean(date && location.trim() && note.trim() && (!asksForCoach || coachUserId));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="violet">
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
            <Field label={t.trials.trialDay} htmlFor="invite-date" required>
              <Input
                id="invite-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </Field>

            <Field label={t.trials.startTime} htmlFor="invite-time">
              {/* The 24-hour clock comes from `Input` itself — see Field.tsx. */}
              <Input
                id="invite-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </Field>
          </div>

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

          {/*
            Who runs it. Only a manager is asked: the API assigns a coach who
            sends this to the session themselves. An academy with no endorsed
            coach cannot hold a private trial at all — the API refuses — so the
            reason replaces the field rather than leaving it empty.
          */}
          {asksForCoach &&
            (coaches?.isSuccess && coachRows.length === 0 ? (
              <Alert tone="warning">{t.trials.noCoachesYet}</Alert>
            ) : (
              <Field
                label={t.trials.runByCoach}
                htmlFor="invite-coach"
                hint={t.trials.runByCoachHint}
                required
              >
                <Select
                  id="invite-coach"
                  value={coachUserId}
                  onChange={(event) => setChosenCoach(event.target.value)}
                  required
                >
                  <option value="">{t.trials.chooseCoach}</option>
                  {coachRows.map((row) => (
                    <option key={row?.userId} value={row?.userId}>
                      {coachName(row)}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}

          <Field label={t.recommendations.inviteNote} htmlFor="invite-note" required>
            <NoteEditor
              id="invite-note"
              value={note}
              onChange={setTypedNote}
              rows={4}
              placeholder={t.placeholders.inviteNote}
            />
          </Field>

          <Field label={t.trials.requirements} htmlFor="invite-requirements">
            <Textarea
              id="invite-requirements"
              value={requirements}
              rows={2}
              maxLength={2000}
              onChange={(event) => setRequirements(event.target.value)}
              placeholder={t.trials.invitePlaceholder}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t.common.cancel}
          </Button>
          <Button
            variant="violet"
            loading={invite.isPending}
            disabled={!ready}
            onClick={() => invite.mutate()}
          >
            <Mail aria-hidden /> {t.recommendations.sendInvite}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
