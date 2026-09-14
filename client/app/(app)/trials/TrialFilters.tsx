'use client';

import { Building2, CalendarDays, MapPin, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { UZBEK_REGIONS, districtsOf } from '@/lib/uzbekistan';
import { cn } from '@/lib/utils';

/** The bounds the trial form itself offers, so the two agree on what an age is. */
const AGE_MIN = 6;
const AGE_MAX = 21;

/** Every key the board can be narrowed by; the count on the button is how many are set. */
const FILTER_KEYS = ['q', 'region', 'district', 'age', 'gender', 'academyId'] as const;

/** How long the name box waits after the last keystroke before asking the server. */
const SEARCH_DEBOUNCE_MS = 400;

/**
 * An icon inside the control, rather than a label above it.
 *
 * Copied from `PlayerFilters` deliberately: five unlabelled controls in a row
 * are five identical grey boxes, and a label above each would double the height
 * of the panel on a phone. `Select` and `Input` already reserve room on the
 * right, so the icon takes the left and nothing overlaps at any width.
 */
function FilterSelect({
  icon: Icon,
  className,
  ...props
}: React.ComponentProps<typeof Select> & { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Icon
        className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Select {...props} className="pl-9" />
    </div>
  );
}

function FilterInput({
  icon: Icon,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Icon
        className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input {...props} className="pl-9" />
    </div>
  );
}

/**
 * Filtering the trials board.
 *
 * ## The state lives in the URL
 *
 * `?region=…&gender=female` rather than component state, for the reason
 * client/CLAUDE.md §8 gives: a filtered board is a thing somebody sends to a
 * friend, reloads, or reaches with the back button. It also means the *server*
 * does the filtering — the page is a Server Component that reads these and asks
 * the API, so a phone on mobile data receives the trials it asked for rather
 * than every trial in the country to discard locally.
 *
 * ## Newest, always
 *
 * The board is ordered newest first and offers no other order. "Recommended"
 * used to sit here; it ranked by position, and position is a thing a player
 * may want to try out of, not a thing to be sorted away from.
 *
 * ## Collapsed by default, on every size
 *
 * The name search stays on the bar — it is what somebody who already knows
 * what they are looking for reaches for. The rest is behind the button, with
 * a count that says how many are active, so a collapsed panel never hides the
 * fact that the list is filtered.
 */
export function TrialFilters({ academies }: { academies: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);

  const region = searchParams?.get('region') ?? '';
  const urlQuery = searchParams?.get('q') ?? '';
  const [query, setQuery] = React.useState(urlQuery);

  const apply = React.useCallback(
    (next: Record<string, string>) => {
      const params = new URLSearchParams(searchParams?.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value) params?.set(key, value);
        else params?.delete(key);
      }
      router.push(`/trials?${params?.toString()}`);
    },
    [router, searchParams],
  );

  // The name box asks the server a moment after typing stops, not per key.
  React.useEffect(() => {
    if (query.trim() === urlQuery) return;
    const timer = setTimeout(() => apply({ q: query.trim() }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, urlQuery, apply]);

  const activeCount = FILTER_KEYS.filter((key) => searchParams?.get(key)).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <FilterInput
          icon={Search}
          type="search"
          aria-label={t.trials.searchTrials}
          placeholder={t.trials.searchTrials}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 sm:max-w-80"
        />

        <Button
          type="button"
          variant={open || activeCount > 0 ? 'outline' : 'ghost'}
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
          className="shrink-0"
        >
          <SlidersHorizontal aria-hidden />
          {t.common.filters}
          {activeCount > 0 && (
            <span className="bg-primary text-primary-foreground grid size-5 place-items-center rounded-full text-xs font-semibold">
              {activeCount}
            </span>
          )}
        </Button>

        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            aria-label={t.common.clear}
            className="shrink-0"
            onClick={() => {
              setQuery('');
              apply({ q: '', region: '', district: '', age: '', gender: '', academyId: '' });
            }}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>

      {open && (
        <div className="border-border bg-surface-3 flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <FilterSelect
            icon={Building2}
            aria-label={t.trials.academyFilter}
            value={searchParams?.get('academyId') ?? ''}
            onChange={(event) => apply({ academyId: event.target.value })}
            className="basis-full sm:basis-60"
          >
            <option value="">{t.trials.anyAcademy}</option>
            {academies.map((academy) => (
              <option key={academy.id} value={academy.id}>
                {academy.name}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            icon={MapPin}
            aria-label={t.onboarding.region}
            value={region}
            // Changing province drops the district with it — a district only
            // means something inside the province it belongs to.
            onChange={(event) => apply({ region: event.target.value, district: '' })}
            className="basis-full sm:basis-52"
          >
            <option value="">{t.player.allRegions}</option>
            {UZBEK_REGIONS?.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </FilterSelect>

          {/*
            District stays on screen whether or not a province is chosen, and is
            simply empty until one is — a control that appears and disappears
            makes the row jump under the reader's thumb.
          */}
          <FilterSelect
            icon={MapPin}
            aria-label={t.academy.district}
            value={searchParams?.get('district') ?? ''}
            disabled={!region}
            onChange={(event) => apply({ district: event.target.value })}
            className="basis-full sm:basis-52"
          >
            <option value="">{t.trials.anyDistrict}</option>
            {districtsOf(region)?.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </FilterSelect>

          {/* The player's age, typed: one number is quicker to type than to
              find in a list of sixteen. Applied when the box is left or Enter
              is pressed, so the board does not reload on every digit. */}
          <FilterInput
            icon={CalendarDays}
            type="number"
            inputMode="numeric"
            min={AGE_MIN}
            max={AGE_MAX}
            aria-label={t.trials.ageFilter}
            placeholder={t.trials.anyAge}
            defaultValue={searchParams?.get('age') ?? ''}
            onBlur={(event) => apply({ age: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') apply({ age: (event.target as HTMLInputElement).value });
            }}
            className="min-w-0 flex-1 sm:flex-none sm:basis-36"
          />

          <FilterSelect
            icon={Users}
            aria-label={t.trials.gender}
            value={searchParams?.get('gender') ?? ''}
            onChange={(event) => apply({ gender: event.target.value })}
            className="min-w-0 flex-1 sm:flex-none sm:basis-40"
          >
            <option value="">{t.trials.anyGender}</option>
            <option value="male">{t.trials.genderOptionMale}</option>
            <option value="female">{t.trials.genderOptionFemale}</option>
            <option value="general">{t.trials.genderOptionGeneral}</option>
          </FilterSelect>
        </div>
      )}
    </div>
  );
}
