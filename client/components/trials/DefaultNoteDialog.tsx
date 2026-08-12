'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyProfile } from '@/lib/api/types';
import { htmlToMarkdown, markdownToHtml, sanitizeNote } from '@/lib/rich-text';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { NoteEditor } from './NoteEditor';
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
 * The note this academy puts on every trial unless it says otherwise.
 *
 * ## Why a default exists at all
 *
 * The note is largely the same each time — the same pitch, the same kit, the
 * same person to ask for — and retyping it per trial is how it ends up
 * half-written, or missing from the one trial where it mattered. Writing it once
 * makes the good version the easy version.
 *
 * ## Why it is copied, not linked
 *
 * A trial takes a *copy* of this text when it is created. Editing the default
 * later changes what the next trial starts from and nothing else: a trial that
 * has already happened keeps the words the family actually read, which is the
 * only version that means anything afterwards.
 */
export function DefaultNoteDialog({ academyId }: { academyId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  /** Null until the manager types — see `InviteToPrivateTrialDialog` for why. */
  const [typed, setTyped] = React.useState<string | null>(null);

  const academy = useQuery({
    queryKey: ['academy', academyId],
    queryFn: () => browserFetch<AcademyProfile>(`/academies/${academyId}`),
    enabled: open,
  });

  const saved = htmlToMarkdown(academy?.data?.defaultTrialNote);
  const markdown = typed ?? saved;

  const save = useMutation({
    mutationFn: () =>
      browserFetch(`/academies/${academyId}`, {
        method: 'PATCH',
        body: { defaultTrialNote: sanitizeNote(markdownToHtml(markdown)) },
      }),
    onSuccess: () => {
      setOpen(false);
      setTyped(null);
      void queryClient.invalidateQueries({ queryKey: ['academy', academyId] });
    },
    meta: { success: t.notes.defaultNoteSaved },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Drop unsaved edits on close, so reopening shows what is actually
        // stored rather than a draft the manager thought they had discarded.
        if (!next) setTyped(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileText aria-hidden /> {t.notes.defaultNote}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.notes.defaultNote}</DialogTitle>
          <DialogDescription>{t.notes.defaultNoteHint}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <NoteEditor
            id="default-trial-note"
            value={markdown}
            onChange={setTyped}
            rows={8}
            placeholder={t.notes.defaultNotePlaceholder}
          />
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t.common.cancel}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {t.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
