'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { browserFetch } from '@/lib/api/browser';

/**
 * Clears the Trials badge, once, when the list is opened.
 *
 * A client island inside a Server Component page: the page itself is rendered on
 * the server and has no moment at which "the user looked at this" is true, and a
 * server-side write inside a render would fire on every prefetch and every
 * revalidation — marking trials seen for somebody who never opened the page.
 * Mounting is the honest signal.
 *
 * Renders nothing. The badge it clears lives in the header, so the header's query
 * is invalidated rather than any state here.
 */
export function MarkTrialsSeen() {
  const queryClient = useQueryClient();

  const markSeen = useMutation({
    mutationFn: () => browserFetch<{ seenAt: string }>('/trials/seen', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trials-unseen'] }),
  });

  // Fired from an effect and guarded by a ref, so React 19's double-invoked
  // effects in development do not send it twice. Failure is silent on purpose:
  // an unread badge is a far smaller problem than an error toast on a page the
  // user opened to read something else.
  const sent = React.useRef(false);
  const mutate = markSeen.mutate;
  React.useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    mutate();
  }, [mutate]);

  return null;
}
