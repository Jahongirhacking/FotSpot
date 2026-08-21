import { CalendarDays, Clock, Hourglass, MapPin } from 'lucide-react';
import Link from 'next/link';

import { PitchBackdrop } from '@/components/shared/FootballArt';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { LoadingImage } from '@/components/ui/LoadingImage';
import type { Trial } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n';
import { formatTrialDates, formatTrialTimes, isTrialUpcoming } from '@/lib/trial-window';
import { formatDate } from '@/lib/utils';

/**
 * One trial, as a card on the board.
 *
 * ## Every row is conditional, and that is the design
 *
 * A trial can now be open-ended, have no cover, no positions and no deadline, so
 * a fixed layout would print a column of empty labels — which reads as missing
 * data rather than as a trial that simply did not state those things. Each block
 * renders only when it has something to say, and the card stays legible at any
 * combination.
 *
 * ## Why the whole card is one link
 *
 * A card with a link in the corner asks the reader to find it. The heading is
 * the accessible name for the whole target, and the badges inside carry no
 * interaction of their own, so there is nothing nested inside the anchor that
 * would need its own keyboard stop.
 */
export function TrialCard({ trial, t }: { trial: Trial; t: Dictionary }) {
  const times = formatTrialTimes(trial);
  const closed = trial.status === 'ARCHIVED' || !isTrialUpcoming(trial);
  const academy = trial.academy;

  return (
    <Card className="hover:border-primary/40 focus-within:ring-ring h-full overflow-hidden transition-colors focus-within:ring-2">
      <Link href={`/trials/${trial.id}`} className="block focus-visible:outline-none">
        {/*
          The cover, or a pitch.
          `aspect-video` is set on the frame rather than the image, so the card's
          height is known before anything loads and a slow cover cannot shift the
          grid under the reader's thumb.
        */}
        <div className="bg-surface-2 relative aspect-video w-full overflow-hidden">
          {trial.coverUrl ? (
            <LoadingImage
              src={trial.coverUrl}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            /* Not a grey box: a trial without a photograph still belongs to a
               football club, and the pitch says so without pretending to be a
               picture of anywhere in particular. */
            <PitchBackdrop className="text-primary/20" />
          )}

          {closed && (
            <span className="absolute top-2 right-2">
              <Badge variant="neutral">
                {trial.status === 'ARCHIVED' ? t.trials.statusArchived : t.trials.statusClosed}
              </Badge>
            </span>
          )}
        </div>

        <CardContent className="space-y-3 p-4">
          {academy && (
            <div className="flex items-center gap-2">
              {/* The logo is decorative — the name sits next to it in text, so
                  announcing it twice would only slow a screen reader down. */}
              <span className="bg-surface-3 relative size-6 shrink-0 overflow-hidden rounded-md">
                {academy.logoUrl && (
                  <LoadingImage
                    src={academy.logoUrl}
                    alt=""
                    loading="lazy"
                    spinner={false}
                    className="size-full object-cover"
                  />
                )}
              </span>
              <span className="text-muted truncate text-xs font-medium">{academy.name}</span>
            </div>
          )}

          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold break-words">{trial.title}</p>
            {trial.ageRangeMax != null && (
              <Badge variant="primary" className="shrink-0">
                U{trial.ageRangeMax}
              </Badge>
            )}
          </div>

          <dl className="text-muted space-y-1 text-xs">
            <Row icon={CalendarDays} label={t.trials.examDate}>
              {formatTrialDates(trial, t.trials.openEnded)}
            </Row>
            {times && (
              <Row icon={Clock} label={t.trials.dailyWindow}>
                {times}
              </Row>
            )}
            <Row icon={MapPin} label={t.trials.location}>
              {trial.location}
            </Row>
            {trial.applyDeadline && (
              <Row icon={Hourglass} label={t.trials.applyDeadline}>
                {formatDate(trial.applyDeadline)}
              </Row>
            )}
          </dl>

          {(trial.ageRangeMin != null || trial.positions.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {trial.ageRangeMin != null && trial.ageRangeMax != null && (
                <Badge variant="outline">
                  {trial.ageRangeMin}–{trial.ageRangeMax}
                </Badge>
              )}
              {/* Four is what fits on a 375px card without wrapping to a third
                  line; the rest are counted rather than hidden, so the reader
                  knows the list continues. */}
              {trial.positions.slice(0, 4).map((position) => (
                <Badge key={position} variant="neutral" className="font-mono">
                  {position}
                </Badge>
              ))}
              {trial.positions.length > 4 && (
                <Badge variant="neutral">+{trial.positions.length - 4}</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Link>
    </Card>
  );
}

/**
 * One labelled fact.
 *
 * The label is visually hidden rather than absent: the icon carries the meaning
 * on screen, and an icon alone is not a label for anybody reading with sound.
 */
function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <dt className="sr-only">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}
