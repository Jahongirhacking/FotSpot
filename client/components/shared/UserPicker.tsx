'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Search, X } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AdminUser } from '@/lib/api/resources';
import type { Page } from '@/lib/api/client';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Field';
import { cn, initials } from '@/lib/utils';

/**
 * Search-and-select a user.
 *
 * Replaces pasting a UUID, which is how promoting an admin and endorsing a scout
 * both worked until now — a step that invites pasting the wrong one, with
 * consequences (granting admin to a stranger) that aren't obvious afterwards.
 *
 * Debounced, and it doesn't query on an empty box: `/admin/users` with no term
 * returns every account on the platform, which is not something to fetch on a
 * keystroke.
 */
export function UserPicker({
  value,
  onChange,
  placeholder,
  excludeIds = [],
}: {
  value: AdminUser | null;
  onChange: (user: AdminUser | null) => void;
  placeholder?: string;
  excludeIds?: string[];
}) {
  const [term, setTerm] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(id);
  }, [term]);

  const { data, isFetching } = useQuery({
    queryKey: ['admin-users', debounced],
    queryFn: () =>
      browserFetch<Page<AdminUser>>(
        `/admin/users?query=${encodeURIComponent(debounced)}&pageSize=10`,
      ),
    enabled: debounced.length >= 2,
  });

  const results = (data?.items ?? []).filter((user) => !excludeIds.includes(user.id));

  if (value) {
    return (
      <div className="border-border bg-surface-2 flex items-center gap-3 rounded-lg border p-2.5">
        <Avatar
          src={value.avatarUrl}
          fallback={initials(value.firstName, value.lastName)}
          className="size-9"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {[value.firstName, value.lastName].filter(Boolean).join(' ') || value.id.slice(0, 8)}
          </p>
          <p className="text-muted truncate text-xs">{value.email ?? value.phone ?? ''}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-muted hover:bg-surface-3 grid size-8 shrink-0 place-items-center rounded-lg"
          aria-label="Clear selection"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={placeholder}
          className="pl-9"
          autoComplete="off"
        />
      </div>

      {debounced.length >= 2 && (
        <div className="border-border max-h-64 overflow-y-auto rounded-lg border">
          {isFetching && results.length === 0 ? (
            <p className="text-muted p-3 text-sm">…</p>
          ) : results.length === 0 ? (
            <p className="text-muted p-3 text-sm">—</p>
          ) : (
            <ul className="divide-border divide-y">
              {results.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(user);
                      setTerm('');
                    }}
                    className={cn(
                      'hover:bg-surface-2 flex w-full items-center gap-3 p-2.5 text-left transition-colors',
                    )}
                  >
                    <Avatar
                      src={user.avatarUrl}
                      fallback={initials(user.firstName, user.lastName)}
                      className="size-8"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {[user.firstName, user.lastName].filter(Boolean).join(' ') ||
                          user.id.slice(0, 8)}
                      </span>
                      <span className="text-muted block truncate text-xs">
                        {user.email ?? user.phone ?? ''}
                      </span>
                    </span>
                    {user.roles.length > 0 && (
                      <Badge variant="neutral" className="shrink-0">
                        {user.roles[0]}
                      </Badge>
                    )}
                    <Check className="text-primary size-4 shrink-0 opacity-0" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
