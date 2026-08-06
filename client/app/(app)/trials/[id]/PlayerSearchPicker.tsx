'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { PlayerProfile } from '@/lib/api/types';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Field';
import { ageFrom, cn, initials } from '@/lib/utils';

/**
 * Any player on the platform, for a private trial's nomination.
 *
 * Deliberately not the squad's candidate picker: that one lists *accounts* a
 * academy could take on and yields a user id, while a trial nomination is about
 * a player profile and may perfectly well name somebody the academy already
 * knows. Same idea, different noun — so a different, smaller component rather
 * than a shared one with a mode flag that changes what its value means.
 */
export function PlayerSearchPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (playerId: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const list = useQuery({
    queryKey: ['player-search', search],
    queryFn: () =>
      browserFetch<{ items: PlayerProfile[]; total: number }>(
        `/players/search?pageSize=20${search ? `&query=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  const rows = list.data?.items ?? [];

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <div className="border-border relative border-b p-2">
        <Search
          className="text-muted pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2"
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

      <div role="listbox" aria-label={t.trials.nominatePlayer} className="max-h-64 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="text-muted p-4 text-center text-sm">
            {list.isLoading ? t.common.loading : t.player.noMatches}
          </p>
        ) : (
          rows.map((player) => (
            <button
              key={player.id}
              type="button"
              role="option"
              aria-selected={player.id === value}
              onClick={() => onChange(player.id)}
              className={cn(
                'hover:bg-surface-2 flex w-full items-center gap-3 p-2 text-left transition-colors',
                player.id === value && 'bg-primary/10',
              )}
            >
              <Avatar
                src={player.avatarUrl}
                fallback={initials(player.firstName ?? '', player.lastName ?? '')}
                className="size-8 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {player.firstName} {player.lastName}
                </span>
                <span className="text-muted block truncate text-xs">
                  {[ageFrom(player.birthDate), player.primaryPosition, player.region]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {player.id === value && (
                <Check className="text-primary size-4 shrink-0" aria-hidden />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
