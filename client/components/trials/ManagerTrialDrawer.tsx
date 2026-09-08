'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarDays, Clock, ExternalLink, MapPin, Users } from 'lucide-react';
import type { Trial } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/Drawer';
import { LoadingImage } from '@/components/ui/LoadingImage';
import { formatTrialDates, formatTrialTimes, isTrialUpcoming } from '@/lib/trial-window';
import { ManagerApplicantList } from './ManagerApplicantList';

/**
 * A trial's participants beside the trials list — the manager's quick look.
 *
 * The header says what the session is — cover, title, ages, gender,
 * positions, when, where, and whether it is still open — and the body is
 * the same applicant list the trial page draws, tabs and squad actions
 * included. Nothing player-facing (the academy's note, the requirements) is
 * repeated: the manager wrote it. The trial's own page is one link away
 * for editing and staffing.
 */
export function ManagerTrialDrawer({
  trial,
  trigger,
}: {
  trial: Trial;
  /** Defaults to a small outline "Participants" button. */
  trigger?: React.ReactNode;
}) {
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
  const archived = trial?.status === 'ARCHIVED';
  const upcoming = isTrialUpcoming(trial);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Users aria-hidden /> {t.trials.participants}
          </Button>
        )}
      </DrawerTrigger>

      <DrawerContent>
        {/* The cover across the top; the status over its foot, where the eye
            lands first. */}
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
          <div className="absolute bottom-3 left-4">
            <Badge variant={archived ? 'neutral' : upcoming ? 'primary' : 'danger'}>
              {archived ? t.trials.statusArchived : upcoming ? t.trials.open : t.trials.closed}
            </Badge>
          </div>
        </div>

        <div className="space-y-2 px-5 pt-4">
          <DrawerTitle className="pr-10 text-lg font-bold">{trial?.title}</DrawerTitle>
          <DrawerDescription className="sr-only">{t.academy.applicantsHint}</DrawerDescription>
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
              <CalendarDays className="size-3.5 shrink-0" aria-hidden /> {when}
            </span>
            {times && (
              <span className="flex items-center gap-1">
                <Clock className="size-3.5 shrink-0" aria-hidden /> {times}
              </span>
            )}
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{trial?.location}</span>
            </span>
          </p>
          {/* Editing, staffing and the note live on the page; this is the look. */}
          <Link
            href={`/trials/${trial?.id}`}
            className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
          >
            {t.trials.openTrialPage} <ExternalLink className="size-3" aria-hidden />
          </Link>
        </div>

        <DrawerBody className="pt-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Users className="text-primary size-4" aria-hidden /> {t.trials.participants}
          </p>
          {/* Mounted only while open, so a list of six trials does not fetch
              six applicant lists on load. */}
          {open && <ManagerApplicantList trial={trial} />}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
