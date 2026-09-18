'use client';

import { CandidatePicker } from '@/components/academy/CandidatePicker';
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
import type { AcademyMemberRole } from '@/lib/api/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, UserPlus } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

/** The three roles a manager invites; MANAGER is never one of them. */
export type InviteRole = Extract<AcademyMemberRole, 'PLAYER' | 'COACH' | 'SCOUT'>;

/**
 * Inviting one person, of one kind, into the squad.
 *
 * ## One dialog per role
 *
 * Adding a player, a scout and a coach are three different acts — a player is
 * placed in a group, a scout works for several academies at once, a coach has
 * to be verified before they can be listed — so each opens its own dialog that
 * says what is being added and shows only accounts that already hold that
 * role. The picker is the same component in all three; the framing is not.
 *
 * ## An invitation, not an add
 *
 * The membership appears only when the person accepts. The warning says so
 * before the choosing, the success message says so after, and the roster
 * behind the dialog is refreshed anyway so a name that was accepted in the
 * meantime shows up without a reload.
 *
 * ## Reset on close
 *
 * The selection and any error are cleared whenever the dialog closes, whether
 * by cancel, by the ✕ or by success — reopening it must not carry over the
 * person chosen last time, who by then may already have been invited.
 */
export function AddMemberDialog({
  academyId,
  role,
  isLocalTeam,
  open,
  onOpenChange,
  onInvited,
}: {
  academyId: string;
  role: InviteRole;
  isLocalTeam: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited?: (role: InviteRole) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [userId, setUserId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      browserFetch(`/academies/${academyId}/invitations`, {
        method: 'POST',
        body: { userId, role },
      }),
    onSuccess: () => {
      toast.success(t.invitations.sent);
      void queryClient.invalidateQueries({ queryKey: ['join-candidates', academyId] });
      void queryClient.invalidateQueries({ queryKey: ['roster', academyId] });
      void queryClient.invalidateQueries({ queryKey: ['academy-invitations', academyId] });
      onInvited?.(role);
      close(false);
    },
    onError: (problem: Error) => setError(problem.message),
  });

  function close(next: boolean) {
    // Not while the request is in flight: closing then would hide the answer.
    if (invite.isPending) return;
    if (!next) {
      setUserId('');
      setError(null);
    }
    onOpenChange(next);
  }

  const copy = COPY[role];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="text-primary size-4" aria-hidden /> {t.academy[copy.title]}
          </DialogTitle>
          <DialogDescription>{t.academy[copy.hint]}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <Alert tone="warning">{t.academy.addWarning}</Alert>
          {error && <Alert tone="danger">{error}</Alert>}

          {/* Mounted only while open, so the search does not run for a dialog
              nobody has asked for. */}
          {open && (
            <CandidatePicker
              academyId={academyId}
              role={role}
              value={userId}
              onChange={setUserId}
            />
          )}

          {/* Somebody without an account yet is a different act — minting one —
              and keeps its own page. */}
          {role === 'COACH' && !isLocalTeam && (
            <p className="text-muted text-xs">
              {t.academy.newCoachAccountHint}{' '}
              <Link href="/academies/mine/coaches/new" className="text-primary hover:underline">
                <Plus className="inline size-3 align-[-1px]" aria-hidden /> {t.academy.addCoach}
              </Link>
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={invite.isPending}>
            {t.common.cancel}
          </Button>
          <Button
            loading={invite.isPending}
            disabled={!userId}
            onClick={() => {
              setError(null);
              invite.mutate();
            }}
          >
            <UserPlus aria-hidden /> {t.academy[copy.action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const COPY = {
  PLAYER: { title: 'addPlayer', hint: 'addPlayerHint', action: 'addPlayer' },
  SCOUT: { title: 'addScout', hint: 'addScoutHint', action: 'addScout' },
  COACH: { title: 'addExistingCoach', hint: 'addExistingCoachHint', action: 'addExistingCoach' },
} as const;
