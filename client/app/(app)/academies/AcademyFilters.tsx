'use client';

import { MapPin, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { UZBEK_REGIONS, districtsOf } from '@/lib/uzbekistan';
import { cn } from '@/lib/utils';

const SEARCH_DEBOUNCE_MS = 400;

function WithIcon({
  icon: Icon,
  className,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Icon
        className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      {children}
    </div>
  );
}

/**
 * Narrowing the directory: a name, a province, a district. The state is the
 * URL, so a filtered directory can be sent, reloaded and returned to — the
 * same arrangement as the trials board, and the server does the filtering.
 */
export function AcademyFilters() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
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
      const qs = params?.toString();
      router.push(qs ? `/academies?${qs}` : '/academies');
    },
    [router, searchParams],
  );

  React.useEffect(() => {
    if (query.trim() === urlQuery) return;
    const timer = setTimeout(() => apply({ q: query.trim() }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, urlQuery, apply]);

  const active = Boolean(urlQuery || region || searchParams?.get('district'));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <WithIcon icon={Search} className="min-w-0 flex-1 basis-full sm:flex-none sm:basis-72">
        <Input
          type="search"
          aria-label={t.academy.searchName}
          placeholder={t.academy.searchName}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
        />
      </WithIcon>
      <WithIcon icon={MapPin} className="min-w-0 flex-1 sm:flex-none sm:basis-52">
        <Select
          aria-label={t.onboarding.region}
          value={region}
          onChange={(event) => apply({ region: event.target.value, district: '' })}
          className="pl-9"
        >
          <option value="">{t.player.allRegions}</option>
          {UZBEK_REGIONS?.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </WithIcon>
      <WithIcon icon={MapPin} className="min-w-0 flex-1 sm:flex-none sm:basis-52">
        <Select
          aria-label={t.academy.district}
          value={searchParams?.get('district') ?? ''}
          disabled={!region}
          onChange={(event) => apply({ district: event.target.value })}
          className="pl-9"
        >
          <option value="">{t.trials.anyDistrict}</option>
          {districtsOf(region)?.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </WithIcon>
      {active && (
        <Button
          type="button"
          variant="ghost"
          aria-label={t.common.clear}
          className="shrink-0"
          onClick={() => {
            setQuery('');
            apply({ q: '', region: '', district: '' });
          }}
        >
          <X aria-hidden />
        </Button>
      )}
    </div>
  );
}
