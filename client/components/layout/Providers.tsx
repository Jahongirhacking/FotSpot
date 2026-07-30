'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/client';
import { SessionProvider, type SessionSeed } from './SessionProvider';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The target user is on metered mobile data (README §14) — don't refetch
        // just because a tab regained focus.
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        retry: (failureCount, error) => {
          // Retrying an auth or permission failure only burns data.
          if (error instanceof ApiError && (error.isUnauthorized || error.isForbidden))
            return false;
          return failureCount < 2;
        },
      },
    },
  });
}

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session: SessionSeed | null;
}) {
  const [queryClient] = React.useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider seed={session}>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
