'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { PLAYING_STYLES, POSITIONS, UZBEK_REGIONS } from '@/lib/schemas/player';
import { humanizeEnum } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { useI18n } from '@/components/layout/I18nProvider';

/**
 * Filters write to the URL, which is the single source of truth for search state.
 * No duplicate copy in a store to drift out of sync.
 */
export function PlayerFilters() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = React.useState(searchParams.get('query') ?? '');

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    // Any filter change resets pagination — page 3 of the old filter is meaningless.
    params.delete('page');
    router.push(`/players?${params.toString()}`);
  }

  const active = ['region', 'position', 'playingStyle', 'query'].filter((key) =>
    searchParams.get(key),
  );

  return (
    <div className="space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply({ query });
        }}
        className="flex flex-wrap gap-2"
        role="search"
      >
        <div className="relative min-w-40 flex-1">
          <Search
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.player.searchByName}
            aria-label={t.player.searchByName}
            className="pl-9"
          />
        </div>
        <Button type="submit">{t.common.search}</Button>
      </form>

      {/* A grid on a phone rather than the horizontal scroller this used to be:
          with three filters, two of them sat off-screen behind a scroll people had
          no reason to suspect was there. Region takes the full row because its
          values are the longest. */}
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <Select
          aria-label={t.onboarding.region}
          value={searchParams.get('region') ?? ''}
          onChange={(event) => apply({ region: event.target.value })}
          className="sm:min-w-36"
        >
          <option value="">{t.player.allRegions}</option>
          {UZBEK_REGIONS.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </Select>

        <Select
          aria-label={t.onboarding.mainPosition}
          value={searchParams.get('position') ?? ''}
          onChange={(event) => apply({ position: event.target.value })}
          className="sm:min-w-28"
        >
          <option value="">{t.player.anyPosition}</option>
          {POSITIONS.map((position) => (
            <option key={position} value={position}>
              {position}
            </option>
          ))}
        </Select>

        {/* The §21.3 filter that positions alone can't express. */}
        <Select
          aria-label={t.onboarding.playingStyle}
          value={searchParams.get('playingStyle') ?? ''}
          onChange={(event) => apply({ playingStyle: event.target.value })}
          className="sm:min-w-40"
        >
          <option value="">{t.player.anyStyle}</option>
          {Object.entries(PLAYING_STYLES).map(([group, styles]) => (
            <optgroup key={group} label={group}>
              {styles.map((style) => (
                <option key={style} value={style}>
                  {humanizeEnum(style)}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {active.map((key) => (
            <Badge key={key} variant="primary">
              {humanizeEnum(key)}: {searchParams.get(key)}
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery('');
              router.push('/players');
            }}
          >
            <X aria-hidden /> Clear
          </Button>
        </div>
      )}
    </div>
  );
}
