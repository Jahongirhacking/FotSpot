'use client';

import * as React from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import { SessionProvider, type SessionSeed } from './SessionProvider';
import { I18nProvider } from './I18nProvider';
import type { Locale } from '@/lib/i18n';

/**
 * Every failed request says why, once.
 *
 * The API already returns a written message for every rejection — "That account
 * is not a scout", "A coach has to approve this player first" — and until now
 * most of them died in a `console.error` or an inline alert three scrolls down.
 * Surfacing them here means a screen has to opt *out* of explaining a failure
 * rather than opt in, which is the right way round.
 *
 * Mutations always toast: the user pressed something and nothing happened, so
 * they are owed a reason, and screens no longer keep their own copy of it.
 * Queries toast only what they cannot show themselves —
 * 401 and 403 are handled by redirects and by pages that render their own empty
 * states, and a background refetch failing on a flaky connection is not news.
 */
function toastError(error: unknown) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error && error.message
        ? error.message
        : null;
  // A message we did not write is not one to put in front of a user.
  if (message) toast.error(message);
}

function makeQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: toastError,
    }),
    queryCache: new QueryCache({
      onError: (error) => {
        if (error instanceof ApiError && (error.isUnauthorized || error.isForbidden)) return;
        toastError(error);
      },
    }),
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
  locale,
}: {
  children: React.ReactNode;
  session: SessionSeed | null;
  locale: Locale;
}) {
  const [queryClient] = React.useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider locale={locale}>
        <SessionProvider seed={session}>{children}</SessionProvider>
        {/* `theme="system"` rather than a fixed palette: the app follows the OS
            and a light toast over a dark page is the one element that would not.
            Bottom on a phone, where the thumb is and where the header is not. */}
        <Toaster
          position="bottom-center"
          theme="system"
          richColors
          closeButton
          toastOptions={{ duration: 6000 }}
        />
      </I18nProvider>
    </QueryClientProvider>
  );
}
