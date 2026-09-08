'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { ApplicantCard } from '@/components/trials/ApplicantCard';
import { useVerdict } from '@/components/trials/useVerdict';
import { VerdictActions, VerdictResult } from '@/components/trials/VerdictControls';
import { ParticipantList } from '@/components/trials/ParticipantList';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/Drawer';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { LoadingImage } from '@/components/ui/LoadingImage';
import { browserFetch } from '@/lib/api/browser';
import type { CoachQueuePage, CoachTrial, PendingTrialApplicant } from '@/lib/api/types';
import { formatTrialDates, formatTrialTimes, isTrialUpcoming } from '@/lib/trial-window';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock, Hourglass, Lock, MapPin, Users } from 'lucide-react';
import * as React from 'react';

/**
 * The coach's two lists, and why they are shaped differently.
 *
 * A **private trial** has exactly one player. Making the coach open a page to
 * find that one player and press one button was a navigation for nothing, so
 * the private list *is* the players: each row is the invitee, with PASS and
 * FAIL on it, and there is no "open trial" anywhere. A **global trial** has
 * many, and they are judged together on the day, so its row is the session —
 * cover, date, place, how many — and one button opens its participants in a
 * drawer beside the dashboard, where they are judged without leaving it.
 *
 * Both are the assigned coach's work and nobody else's (TRIAL.md §10), and
 * both are read from the same queue with the kind as the only difference.
 */
export function CoachQueues() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <PrivateTrialsSection />
      <GlobalTrialsSection />
      <p className="text-muted text-xs">{t.dashboard.coachQueuesFootnote}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The players on this coach's private trials who are ready to be judged.
 *
 * ## Only players who said yes
 *
 * The API lists a private trial's player only once they have accepted the
 * invitation (TRIAL.md §11): an invitation still unanswered is between the
 * academy and the family, and the coach has nobody to judge yet. Those are
 * counted — "2 invitations pending" — and never named.
 *
 * ## The verdict stays on the row
 *
 * A pass is one press; the row turns into ✓ Passed under the thumb and the
 * toast offers Undo for a short window. A fail asks first. See `useVerdict`.
 */
export function PrivateTrialsSection() {
  const { t, f } = useI18n();
  const verdict = useVerdict();

  const queue = useQuery({
    queryKey: ['coach-private-queue'],
    queryFn: () =>
      browserFetch<CoachQueuePage>('/trials/coaching/pending?type=PRIVATE&pageSize=50'),
  });

  const rows = queue.data?.items ?? [];
  const pending = queue.data?.pendingInvitations ?? 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="text-primary size-4" aria-hidden /> {t.trials.privateTrials}
          {rows.length > 0 && <Badge variant="warning">{rows.length}</Badge>}
        </CardTitle>
        <p className="text-muted text-sm">{t.trials.privateQueueHint}</p>
      </CardHeader>

      <CardContent className="space-y-3 p-3">
        {queue.isLoading ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : queue.isError ? (
          <Alert tone="danger">{t.dashboard.trialQueueFailed}</Alert>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Lock}
            title={t.trials.noParticipantsYet}
            description={t.trials.noParticipantsYetHint}
          />
        ) : (
          <ul className="border-border divide-border overflow-hidden rounded-lg border">
            {rows.map((row) => (
              <PrivateTrialRow
                key={row?.id}
                row={row}
                pending={verdict.pendingId === row?.id || verdict.undoingId === row?.id}
                onPass={() => verdict.record(row?.id, 'PASS')}
                onFail={(note) => verdict.record(row?.id, 'FAIL', note)}
              />
            ))}
          </ul>
        )}

        {/* Said without names: who is still deciding is not the coach's business
            until they have decided. */}
        {pending > 0 && (
          <p className="text-muted flex items-center gap-1.5 text-xs">
            <Hourglass className="size-3.5 shrink-0" aria-hidden />
            {f(t.trials.pendingInvitations, { count: pending })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PrivateTrialRow({
  row,
  pending,
  onPass,
  onFail,
}: {
  row: PendingTrialApplicant;
  pending: boolean;
  onPass: () => void;
  onFail: (note?: string) => void;
}) {
  const { t } = useI18n();
  const name = `${row?.player?.firstName ?? ''} ${row?.player?.lastName ?? ''}`.trim();
  const when = [
    row?.trial && formatTrialDates(row.trial, t.trials.openEnded),
    row?.trial && formatTrialTimes(row.trial),
    row?.trial?.location,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ApplicantCard
      player={row?.player}
      status={row?.status}
      detail={<p className="text-muted truncate text-xs">{when}</p>}
      actions={
        row?.result ? (
          <VerdictResult result={row.result} compact />
        ) : (
          <VerdictActions playerName={name} pending={pending} onPass={onPass} onFail={onFail} />
        )
      }
    />
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The global trials this coach works. Each card is the session — its cover,
 * when, where, how many — and one button opens the participants in a drawer,
 * because a global trial is judged as a group and the coach should not have
 * to leave the dashboard to do it.
 */
export function GlobalTrialsSection({
  initialTrials,
  showSettled = false,
}: {
  /** Server-rendered first paint, when the page has it. */
  initialTrials?: CoachTrial[];
  /** Also list archived sessions, under their own heading. */
  showSettled?: boolean;
}) {
  const { t } = useI18n();

  const trials = useQuery({
    queryKey: ['trials', 'coaching'],
    queryFn: () => browserFetch<CoachTrial[]>('/trials/coaching/mine'),
    ...(initialTrials ? { initialData: initialTrials } : {}),
  });

  const general = (trials.data ?? []).filter((trial) => trial?.type === 'GENERAL');
  // Work first: a session with players still unanswered is today's job
  // however long ago its date was, and one nobody waits on is not.
  const open = general
    .filter((trial) => trial?.status !== 'ARCHIVED')
    .sort((a, b) => b.awaitingVerdict - a.awaitingVerdict);
  const settled = general.filter((trial) => trial?.status === 'ARCHIVED');

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="text-primary size-4" aria-hidden /> {t.trials.globalTrials}
            {open.length > 0 && <Badge variant="neutral">{open.length}</Badge>}
          </CardTitle>
          <p className="text-muted text-sm">{t.trials.globalQueueHint}</p>
        </CardHeader>

        <CardContent className="p-3">
          {trials.isLoading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : trials.isError ? (
            <Alert tone="danger">{t.dashboard.trialQueueFailed}</Alert>
          ) : open.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={t.trials.noAssignedTrials}
              description={t.trials.noAssignedTrialsHint}
            />
          ) : (
            <ul className="border-border divide-border overflow-hidden rounded-lg border">
              {open.map((trial) => (
                <GlobalTrialRow key={trial?.id} trial={trial} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {showSettled && settled.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {t.trials.settledTrials}
              <Badge variant="neutral">{settled.length}</Badge>
            </CardTitle>
            <p className="text-muted text-sm">{t.trials.settledTrialsHint}</p>
          </CardHeader>
          <CardContent className="p-3">
            <ul className="border-border divide-border overflow-hidden rounded-lg border">
              {settled.map((trial) => (
                <GlobalTrialRow key={trial?.id} trial={trial} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function GlobalTrialRow({ trial }: { trial: CoachTrial }) {
  const { t, f } = useI18n();
  const past = !isTrialUpcoming(trial);
  const when = [formatTrialDates(trial, t.trials.openEnded), formatTrialTimes(trial)]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 p-3 sm:flex-nowrap">
      {/* The cover, as the row's mark — the same picture the board shows, so a
          coach recognises the session before reading its name. */}
      <div className="bg-surface-3 relative aspect-video w-full shrink-0 overflow-hidden rounded-lg sm:aspect-[4/3] sm:w-28">
        {trial?.coverUrl ? (
          <LoadingImage
            src={trial.coverUrl}
            alt=""
            spinner={false}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span className="text-muted grid size-full place-items-center">
            <CalendarDays className="size-6" aria-hidden />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 basis-48">
        <p className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold">{trial?.title}</span>
          {trial?.status === 'ARCHIVED' && (
            <Badge variant="neutral">{t.trials.statusArchived}</Badge>
          )}
          {trial?.awaitingVerdict > 0 && (
            <Badge variant="primary">
              {f(t.trials.awaitingCount, { count: trial?.awaitingVerdict })}
            </Badge>
          )}
        </p>
        <p className="text-muted mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3" aria-hidden /> {when}
            {past && ` · ${t.trials.datePassed}`}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3" aria-hidden /> {trial?.location}
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3" aria-hidden />
            {f(t.trials.playerCount, { count: trial?.applicantCount })}
          </span>
        </p>
      </div>

      <ParticipantsDrawer trial={trial} />
    </li>
  );
}

/**
 * The trial's participants, beside the dashboard.
 *
 * The header says only what a coach on the pitch needs — the session, who it
 * is for, when — and the list is the same `ParticipantList` the trial page
 * draws, so a verdict given here is the verdict, not a copy. Nothing
 * player-facing (the academy's note, the requirements) is repeated: the
 * coach is here to judge, not to read the invitation.
 */
function ParticipantsDrawer({ trial }: { trial: CoachTrial }) {
  const { t, f } = useI18n();
  const [open, setOpen] = React.useState(false);
  const when = formatTrialDates(trial, t.trials.openEnded);
  const times = formatTrialTimes(trial);
  const gender =
    trial?.gender === 'female'
      ? t.trials.genderFemale
      : trial?.gender === 'general'
        ? t.trials.genderGeneral
        : t.trials.genderMale;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm" variant={trial?.awaitingVerdict > 0 ? 'primary' : 'outline'}>
          <Users aria-hidden /> {t.trials.participants}
        </Button>
      </DrawerTrigger>

      <DrawerContent>
        {/* The cover across the top, the facts over its foot. */}
        <div className="bg-surface-3 relative aspect-[3/1] w-full shrink-0 overflow-hidden">
          {trial?.coverUrl ? (
            <LoadingImage
              src={trial.coverUrl}
              alt={f(t.trials.coverAlt, { title: trial?.title })}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <span className="text-muted grid size-full place-items-center">
              <CalendarDays className="size-8" aria-hidden />
            </span>
          )}
        </div>

        <div className="space-y-2 px-5 pt-4">
          <DrawerTitle className="text-lg font-bold">{trial?.title}</DrawerTitle>
          <DrawerDescription className="sr-only">{t.trials.sheetHint}</DrawerDescription>
          <div className="flex flex-wrap gap-1.5">
            {trial?.ageRangeMin != null && trial?.ageRangeMax != null && (
              <Badge variant="primary">
                {t.trials.ages} {trial?.ageRangeMin}–{trial?.ageRangeMax}
              </Badge>
            )}
            <Badge variant="outline">{gender}</Badge>
            {(trial?.positions ?? []).map((position) => (
              <Badge key={position} variant="neutral" className="font-mono">
                {position}
              </Badge>
            ))}
          </div>
          <p className="text-muted flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden /> {when}
            </span>
            {times && (
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden /> {times}
              </span>
            )}
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden /> {trial?.location}
            </span>
          </p>
        </div>

        <DrawerBody className="pt-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Users className="text-primary size-4" aria-hidden /> {t.trials.participants}
          </p>
          {/* Mounted only while open, so a dashboard with six sessions does not
              fetch six participant lists on load. */}
          {open && <ParticipantList trial={trial} />}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
