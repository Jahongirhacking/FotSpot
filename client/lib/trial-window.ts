import { formatDate } from '@/lib/utils';

/**
 * How a trial's period reads, including when it has none.
 *
 * ## Why this exists rather than `formatDate(trial.date)` at each site
 *
 * `date` became nullable when open-ended trials arrived, and every screen that
 * showed a trial was calling `formatDate` on it directly — eight of them.
 * `new Date(null)` is the epoch and `new Date(undefined)` is `Invalid Date`, so
 * the failure mode was never a blank space: it was "1 Jan 1970" or the literal
 * text "Invalid Date" on a card a parent is reading. One formatter means the
 * question "what does a trial with no date look like?" has one answer.
 *
 * The label for the open-ended case is passed in rather than hardcoded, because
 * it is user-facing text and this file has no access to the dictionary.
 */
export interface TrialPeriod {
  date?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

/** `16 Sep 2026 – 25 Sep 2026`, `16 Sep 2026`, or the open-ended label. */
export function formatTrialDates(trial: TrialPeriod, openEndedLabel: string): string {
  if (!trial?.date) return openEndedLabel;

  const from = formatDate(trial.date);
  if (!trial.endDate) return from;

  const to = formatDate(trial.endDate);
  // A one-day window is entered as the same date twice, and printing it twice
  // reads as a mistake rather than as a single day.
  return from === to ? from : `${from} – ${to}`;
}

/** `09:00 – 18:00`, or null when the trial states no daily window. */
export function formatTrialTimes(trial: TrialPeriod): string | null {
  if (!trial?.startTime || !trial?.endTime) return null;
  return `${trial.startTime} – ${trial.endTime}`;
}

/**
 * Whether a trial is still ahead.
 *
 * An open-ended trial always is: it has no date to be past, and it runs until
 * the academy archives it. `new Date(null) > new Date()` is `false`, so the
 * screens that asked that question directly were quietly marking every
 * open-ended trial as closed.
 */
export function isTrialUpcoming(trial: TrialPeriod, now: Date = new Date()): boolean {
  if (!trial?.date) return true;
  // The end of the window is what makes a multi-day trial still current on its
  // last morning; a single-day trial falls back to its own date.
  const ends = new Date(trial.endDate ?? trial.date);
  return ends.getTime() >= now.getTime();
}
