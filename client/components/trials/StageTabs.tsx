'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/components/layout/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { APPLICATION_STAGES, type ApplicationStage } from '@/lib/api/types';
import { cn } from '@/lib/utils';

/** The stage in the reader's words. */
export function useStageLabel(): (stage: ApplicationStage) => string {
  const { t } = useI18n();
  const labels: Record<ApplicationStage, string> = {
    PENDING: t.trials.stagePending,
    FAILED: t.trials.stageFailed,
    PASSED: t.trials.stagePassed,
    CANDIDACY_CLOSED: t.trials.stageCandidacyClosed,
    SQUAD_INVITED: t.trials.stageSquadInvited,
    INVITATION_DECLINED: t.trials.stageInvitationDeclined,
    SQUAD_JOINED: t.trials.stageSquadJoined,
  };
  return (stage) => labels[stage] ?? stage;
}

/**
 * Where the applicant stands, in one word and one colour: a yes is green, a
 * no is red, and everything still waiting on somebody is amber or grey.
 */
export function StageBadge({ stage }: { stage: ApplicationStage }) {
  const label = useStageLabel();
  const variant =
    stage === 'PASSED' || stage === 'SQUAD_JOINED'
      ? 'success'
      : stage === 'FAILED' || stage === 'CANDIDACY_CLOSED' || stage === 'INVITATION_DECLINED'
        ? 'danger'
        : stage === 'SQUAD_INVITED'
          ? 'warning'
          : 'neutral';
  return <Badge variant={variant}>{label(stage)}</Badge>;
}

/**
 * One tab per stage, with how many are at it.
 *
 * ## Why tabs and not a dropdown
 *
 * A manager reads a trial's applicants as a pipeline — who is still waiting
 * on the coach, who passed, who has a squad place and who said no — and
 * every stage is a question they ask separately. A dropdown hides the shape
 * of the pipeline; a row of tabs with counts *is* the shape. The row scrolls
 * sideways on a phone rather than wrapping into three lines, and wraps on
 * anything wider so no tab is ever cut off.
 *
 * Every stage is drawn, even the empty ones: the tab that reads "Failed 0"
 * is an answer, where a tab that is not there is a question.
 */
export function StageTabs({
  counts,
  value,
  onChange,
  label: ariaLabel,
}: {
  counts: Partial<Record<ApplicationStage, number>>;
  value: ApplicationStage;
  onChange: (stage: ApplicationStage) => void;
  label?: string;
}) {
  const { t } = useI18n();
  const label = useStageLabel();

  return (
    <div
      role="tablist"
      aria-label={ariaLabel ?? t.trials.filterByStatus}
      className="-mx-1 flex snap-x [scrollbar-width:none] gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
    >
      {APPLICATION_STAGES.map((stage) => {
        const count = counts[stage] ?? 0;
        const active = stage === value;
        return (
          <button
            key={stage}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(stage)}
            className={cn(
              'inline-flex min-h-9 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : count === 0
                  ? 'border-border text-muted hover:border-primary/40'
                  : 'border-border hover:border-primary/50',
            )}
          >
            {label(stage)}
            <span
              className={cn(
                'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5',
                active ? 'bg-primary-foreground/20' : 'bg-surface-2',
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The next page, on request.
 *
 * A button rather than a scroll trigger: the lists this sits under are
 * worked through — a coach judging, a manager inviting — and a page that
 * grows under somebody's thumb moves the row they were about to press.
 * Says how many are left, so "load more" is a known cost.
 */
export function LoadMore({
  shown,
  total,
  loading,
  onLoadMore,
}: {
  shown: number;
  total: number;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const { t, f } = useI18n();
  const left = Math.max(0, total - shown);
  if (left === 0) return null;
  return (
    <div className="flex justify-center pt-1">
      <Button size="sm" variant="outline" loading={loading} onClick={onLoadMore}>
        <ChevronDown aria-hidden /> {f(t.common.loadMore, { count: left })}
      </Button>
    </div>
  );
}

/** How many rows sit at each stage — the numbers on the tabs. */
export function countStages<T extends { stage?: ApplicationStage }>(rows: T[]) {
  const counts: Partial<Record<ApplicationStage, number>> = {};
  for (const row of rows) {
    const stage = row?.stage ?? 'PENDING';
    counts[stage] = (counts[stage] ?? 0) + 1;
  }
  return counts;
}

/**
 * The tab that is open, defaulting to what is waiting on the academy.
 *
 * Kept as a hook so the two screens that draw the tabs share the default and
 * the rule for it: pending first, always — a manager opens a trial to see who
 * is still owed an answer, and a tab that opens on the archive is a click
 * before the work every time.
 */
export function useStageTab(initial: ApplicationStage = 'PENDING') {
  return React.useState<ApplicationStage>(initial);
}
