'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { browserFetch } from '@/lib/api/browser';
import type { Page } from '@/lib/api/client';
import type { ProfessionalPlayer } from '@/lib/api/types';
import { footLabel, fullName } from '@/lib/professional-players';
import { initials } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Search, Star, X } from 'lucide-react';
import * as React from 'react';

/**
 * The academy's claim on its professional alumni — README §21.
 *
 * A collection, like photos and featured: no Save button, every add and
 * remove is written at once, so the manager never leaves with a half-made
 * list. The whole set goes in one PUT, the same as `featured`, and the API
 * checks that the writer manages *this* academy.
 */
export function ProfessionalPlayersCard({ academyId }: { academyId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [query, setQuery] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const current = useQuery({
    queryKey: ['academy-professional-players', academyId],
    queryFn: () =>
      browserFetch<ProfessionalPlayer[]>(`/academies/${academyId}/professional-players`),
  });

  const candidates = useQuery({
    queryKey: ['professional-players', 'pick', search],
    queryFn: () =>
      browserFetch<Page<ProfessionalPlayer>>(
        `/professional-players?pageSize=20${search ? `&query=${encodeURIComponent(search)}` : ''}`,
      ).then((page) => page.items),
    enabled: search.length > 0,
  });

  const chosen = (current.data ?? []).map((player) => player.id);

  const save = useMutation({
    mutationFn: (professionalPlayerIds: string[]) =>
      browserFetch<ProfessionalPlayer[]>(`/academies/${academyId}/professional-players`, {
        method: 'PUT',
        body: { professionalPlayerIds },
      }),
    onSuccess: (players) => {
      setError(null);
      queryClient.setQueryData(['academy-professional-players', academyId], players);
    },
    onError: (problem: Error) => setError(problem.message),
  });

  const add = (id: string) => {
    if (chosen.includes(id)) return;
    save.mutate([...chosen, id]);
  };
  const remove = (id: string) => save.mutate(chosen.filter((entry) => entry !== id));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="text-primary size-4" aria-hidden /> {t.professional.editorTitle}
        </CardTitle>
        <p className="text-muted text-xs">{t.professional.editorHint}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}

        {current.isError ? (
          <Alert tone="danger">{t.common.couldNotLoad}</Alert>
        ) : (current.data ?? []).length === 0 ? (
          <p className="text-muted text-sm">
            {current.isLoading ? t.common.loading : t.professional.noneSelected}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {(current.data ?? []).map((player) => (
              <li
                key={player.id}
                className="bg-surface-2 flex items-center gap-2 rounded-full py-1 pr-1 pl-1"
              >
                <Avatar
                  src={player.avatarUrl}
                  fallback={initials(player.firstName, player.lastName)}
                  className="size-7"
                />
                <span className="max-w-40 truncate text-sm">{fullName(player)}</span>
                <button
                  type="button"
                  aria-label={`${t.professional.removeFromAcademy}: ${fullName(player)}`}
                  disabled={save.isPending}
                  onClick={() => remove(player.id)}
                  className="text-muted hover:bg-danger/15 hover:text-danger grid size-7 place-items-center rounded-full transition disabled:opacity-50"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="relative">
          <Search
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.professional.searchPlayers}
            aria-label={t.professional.searchPlayers}
            className="pl-9"
          />
        </div>

        {search && (
          <div className="border-border max-h-64 overflow-y-auto rounded-lg border">
            {candidates.isError ? (
              <p className="text-danger p-3 text-sm">{t.common.couldNotLoad}</p>
            ) : candidates.isLoading ? (
              <p className="text-muted p-3 text-sm">{t.common.loading}</p>
            ) : (candidates.data ?? []).length === 0 ? (
              <p className="text-muted p-3 text-sm">{t.professional.noResults}</p>
            ) : (
              <ul className="divide-border divide-y">
                {(candidates.data ?? []).map((player) => {
                  const added = chosen.includes(player.id);
                  return (
                    <li key={player.id} className="flex items-center gap-3 px-3 py-2">
                      <Avatar
                        src={player.avatarUrl}
                        fallback={initials(player.firstName, player.lastName)}
                        className="size-8 shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {fullName(player)}
                        </span>
                        <span className="text-muted block truncate text-xs">
                          {[player.position, footLabel(player.dominantFoot, t)]
                            .filter(Boolean)
                            .join(' · ') || t.professional.notSet}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant={added ? 'ghost' : 'outline'}
                        disabled={added || save.isPending}
                        onClick={() => add(player.id)}
                      >
                        {added ? <Check aria-hidden /> : <Plus aria-hidden />}
                        {added ? t.professional.alreadyAdded : t.professional.addToAcademy}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
