'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AdminUser } from '@/lib/api/resources';
import type { Page } from '@/lib/api/client';
import { useI18n } from '@/components/layout/I18nProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { initials } from '@/lib/utils';

/** Debounced directory. Lists recent accounts when the box is empty. */
export function UserDirectory() {
  const { t } = useI18n();
  const [term, setTerm] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(id);
  }, [term]);

  const { data } = useQuery({
    queryKey: ['admin-directory', debounced],
    queryFn: () =>
      browserFetch<Page<AdminUser>>(
        `/admin/users?query=${encodeURIComponent(debounced)}&pageSize=25`,
      ),
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t.admin.searchUsers}
          className="pl-9"
          aria-label={t.admin.searchUsers}
        />
      </div>

      <p className="text-muted text-xs">{data?.total ?? 0}</p>

      <ul className="space-y-2">
        {(data?.items ?? []).map((user) => (
          <li key={user.id}>
            <Card className="hover:border-primary/40 transition-colors">
              <Link href={`/admin/users/${user.id}`} className="block">
                <CardContent className="flex items-center gap-3 p-3">
                  <Avatar
                    src={user.avatarUrl}
                    fallback={initials(user.firstName, user.lastName)}
                    className="size-9"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {[user.firstName, user.lastName].filter(Boolean).join(' ') ||
                        user.id.slice(0, 8)}
                    </p>
                    <p className="text-muted truncate text-xs">{user.email ?? user.phone ?? ''}</p>
                  </div>
                  <div className="hidden shrink-0 gap-1 sm:flex">
                    {user.roles.slice(0, 3).map((role) => (
                      <Badge key={role} variant="neutral">
                        {role}
                      </Badge>
                    ))}
                  </div>
                  <ChevronRight className="text-muted size-4 shrink-0" aria-hidden />
                </CardContent>
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
