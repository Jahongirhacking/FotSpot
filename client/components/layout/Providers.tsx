'use client';

import * as React from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import {
  DEFAULT_MUTATION_ERROR_KIND,
  DEFAULT_QUERY_ERROR_KIND,
  reportBackgroundError,
} from '@/lib/api/error-kind';
import { SessionProvider, type SessionSeed } from './SessionProvider';
import { I18nProvider } from './I18nProvider';
import type { Locale } from '@/lib/i18n';

/**
 * Every failure is either shown or recorded, and never both.
 *
 * See `lib/api/error-kind.ts` for the two kinds. In short: a `client` error
 * happened because somebody pressed something and is owed an answer; a
 * `background` error happened because the app asked a question nobody was
 * waiting on. This is the one place that decision turns into a toast or a
 * silent report, so no screen has to remember to handle it.
 *
 * The rule used to be "queries toast unless they are 401 or 403", which put a
 * red banner in front of a coach because a speculative "do you have a review for
 * this player" probe came back empty. Nothing was wrong with their account and
 * there was nothing for them to do about it.
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
      // A mutation that names a `success` message says it once, here. Screens
      // that change visibly enough on their own simply do not set one.
      onSuccess: (_data, _variables, _context, mutation) => {
        const message = mutation.meta?.success;
        if (message) toast.success(message);
      },
      onError: (error, _variables, _context, mutation) => {
        const kind = mutation.meta?.errorKind ?? DEFAULT_MUTATION_ERROR_KIND;
        if (kind === 'background') return reportBackgroundError(error);
        toastError(error);
      },
    }),
    queryCache: new QueryCache({
      onError: (error, query) => {
        const kind = query.meta?.errorKind ?? DEFAULT_QUERY_ERROR_KIND;
        if (kind === 'background') {
          return reportBackgroundError(error, { key: query.queryKey });
        }
        // Even a client-marked query stays quiet on auth: 401 is handled by the
        // redirect in `browserFetch`, and 403 by pages that render their own
        // "you cannot see this" state.
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
