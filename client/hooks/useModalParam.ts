'use client';

import { UI_ONLY_PARAMS } from '@/lib/player-url';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

/**
 * A modal whose open state lives in the URL.
 *
 * `?clip=abc` over `/players/@aziz` means the clip is open; the same page with
 * no such parameter means it is closed. The URL is the one source of truth,
 * so a refresh keeps the modal open, the address can be shared, and the
 * browser's own Back closes it — which is what a person on a phone presses
 * first.
 *
 * ## Open pushes, close replaces
 *
 * Opening pushes a history entry, so Back returns to the page beneath. Closing
 * *replaces* the current entry, so the entry that held the modal is gone: Back
 * after a manual close goes where the reader was before, not back into the
 * modal they just dismissed. Both keep every other parameter — the filters, the
 * page, the tab somebody set are not this modal's to discard.
 *
 * ## One modal at a time
 *
 * Every modal parameter is registered in `UI_ONLY_PARAMS`; opening one drops
 * the others, so two dialogs can never be told to open over the same page.
 * The same list is what marks these URLs `noindex` — a modal parameter is
 * view state, never a page of its own.
 *
 * ## Idempotent
 *
 * Opening what is already open, or closing what is already closed, does
 * nothing: a double press adds one history entry, and a close that arrives
 * after Back already removed the parameter does not navigate again.
 */
export function useModalParam(param: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(param);

  const open = React.useCallback(
    (next: string, options: { replace?: boolean } = {}) => {
      if (searchParams.get(param) === next) return;
      const query = new URLSearchParams(searchParams);
      for (const other of UI_ONLY_PARAMS) if (other !== param) query.delete(other);
      query.set(param, next);
      const url = `${pathname}?${query.toString()}`;
      // `replace` is for moving *within* an open modal — the next photo, the
      // next clip — which must not pile up history entries Back would walk.
      if (options.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [param, pathname, router, searchParams],
  );

  const close = React.useCallback(() => {
    if (!searchParams.has(param)) return;
    const query = new URLSearchParams(searchParams);
    query.delete(param);
    const rest = query.toString();
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [param, pathname, router, searchParams]);

  return { value, open, close };
}
