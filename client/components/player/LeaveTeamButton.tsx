'use client';

import { useMutation } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Alert } from '@/components/ui/Feedback';
import { browserFetch } from '@/lib/api/browser';
import { interpolate } from '@/lib/i18n';

/**
 * A player leaving a local team.
 *
 * ## Why this exists and its academy counterpart does not
 *
 * A local team is an arrangement people enter and stop turning up to; an academy
 * membership ends only when another academy takes the player on or when this one
 * releases them (PLAYER_SQUAD.md §5C). So there is no "leave academy" control
 * anywhere — not a disabled one, not a hidden one. `AcademiesService.leaveTeam`
 * refuses an academy id outright, which is what makes the absence a rule rather
 * than an oversight.
 *
 * ## Confirmed, and the name is in the question
 *
 * "Leave G'uzor FC?" rather than "Are you sure?": a player in three local teams
 * is looking at three identical buttons, and the only thing that distinguishes
 * the one they meant is which team it belongs to. Naming it in the dialog is the
 * difference between confirming and guessing.
 *
 * Not optimistic. Leaving is the kind of thing you do once and cannot undo from
 * here — rejoining needs a fresh invitation — so the row stays until the server
 * has actually agreed, and `router.refresh()` is what removes it.
 */
export function LeaveTeamButton({
  academyId,
  academyName,
}: {
  academyId: string;
  academyName: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const leave = useMutation({
    mutationFn: () => browserFetch(`/academies/${academyId}/membership`, { method: 'DELETE' }),
    onSuccess: () => {
      setOpen(false);
      // The lists are rendered on the server from the profile response, so this
      // is what makes the team disappear rather than a second copy of the state.
      router.refresh();
    },
  });

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <LogOut aria-hidden /> {t.academy?.leaveTeam}
      </Button>

      <Dialog open={open} onOpenChange={(next) => !leave.isPending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {interpolate(t.academy?.leaveTeamConfirm, { team: academyName })}
            </DialogTitle>
            <DialogDescription>{t.academy?.leaveTeamWarning}</DialogDescription>
          </DialogHeader>

          {leave.isError && (
            <DialogBody>
              <Alert tone="danger">{t.common?.somethingWrong}</Alert>
            </DialogBody>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={leave.isPending}>
              {t.common?.cancel}
            </Button>
            <Button variant="danger" loading={leave.isPending} onClick={() => leave.mutate()}>
              <LogOut aria-hidden /> {t.academy?.leaveTeam}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
