'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Input, Select } from '@/components/ui/Field';
import type { TrialApplicationStatus } from '@/lib/api/types';
import { Search } from 'lucide-react';
import * as React from 'react';

/** What the filter bar can narrow to. Only states the domain actually has. */
const FILTERABLE = [
  'APPLIED',
  'SCREENING',
  'SHORTLISTED',
  'INVITED',
  'CONFIRMED',
  'PASSED',
  'FAILED',
  'REJECTED',
  'ACCEPTED',
] as const satisfies readonly TrialApplicationStatus[];

export interface Filterable {
  status: TrialApplicationStatus;
  player?: { firstName?: string | null; lastName?: string | null; primaryPosition?: string | null };
  createdAt?: string;
}

/**
 * Narrows a list of applicants by name and by state.
 *
 * ## Why the filter is here and not in the URL
 *
 * Unlike the trials board, this list is already loaded — it is one academy's
 * applicants for one session, fetched in a single request. Filtering it in the
 * browser is instant, where a round trip per keystroke would not be, and there
 * is nothing here worth linking somebody to: a coach filtering their own sheet
 * on the day is not sharing that view with anybody.
 *
 * ## Only real states
 *
 * The status options are the `TrialApplicationStatus` values themselves rather
 * than an invented set like "In progress". A filter that names a state the
 * backend cannot be in returns an empty list and reads as a bug.
 *
 * Statuses that nobody in this list actually holds are dropped from the dropdown
 * — offering "Failed" on a trial where nobody has failed is a control that can
 * only disappoint.
 */
export function ApplicantGrid<T extends Filterable>({
  applicants,
  children,
  empty,
}: {
  applicants: T[];
  /** Renders one card. Given the filtered list, in the order shown. */
  children: (applicant: T) => React.ReactNode;
  /** Shown when the filters exclude everything — not when there are none. */
  empty?: React.ReactNode;
}) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<'' | TrialApplicationStatus>('');

  const present = React.useMemo(
    () => FILTERABLE.filter((value) => applicants?.some((row) => row?.status === value)),
    [applicants],
  );

  const shown = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (applicants ?? []).filter((row) => {
      if (status && row?.status !== status) return false;
      if (!needle) return true;
      const haystack = [row?.player?.firstName, row?.player?.lastName, row?.player?.primaryPosition]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [applicants, query, status]);

  return (
    <div className="space-y-3">
      {/* Only worth showing once there is enough to sift. Two applicants and a
          search box is furniture. */}
      {applicants?.length > 4 && (
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-64">
            <Search
              className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.trials.searchApplicants}
              aria-label={t.trials.searchApplicants}
              className="pl-9"
            />
          </div>

          {present.length > 1 && (
            <Select
              value={status}
              aria-label={t.trials.filterByStatus}
              onChange={(event) => setStatus(event.target.value as TrialApplicationStatus | '')}
              className="min-w-0 flex-1 sm:max-w-48 sm:flex-none"
            >
              <option value="">{t.trials.allStatuses}</option>
              {present.map((value) => (
                <option key={value} value={value}>
                  {(t.trials as Record<string, string>)[STATUS_KEY[value]] ?? value}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        (empty ?? <p className="text-muted p-2 text-sm">{t.trials.noApplicantsMatch}</p>)
      ) : (
        /*
          A list, not a grid. See `ApplicantCard` — a coach going down a set of
          applicants deciding one thing about each reads a column far faster
          than a wall of tall cards.
        */
        <ul className="border-border divide-border overflow-hidden rounded-lg border">
          {shown.map((applicant) => children(applicant))}
        </ul>
      )}
    </div>
  );
}

/** Status value to its dictionary key, so the dropdown reads in the viewer's language. */
const STATUS_KEY: Record<TrialApplicationStatus, string> = {
  APPLIED: 'statusApplied',
  SCREENING: 'statusScreening',
  SHORTLISTED: 'statusShortlisted',
  INVITED: 'statusInvited',
  CONFIRMED: 'statusConfirmed',
  PASSED: 'statusPassed',
  FAILED: 'statusFailed',
  REJECTED: 'statusRejected',
  ACCEPTED: 'statusAccepted',
};
