'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { PLAYING_STYLE_PARAM } from '@/lib/player-url';

/**
 * Opens the playing-style modal for `style`.
 *
 * The modal is driven by `?showPlayingStyle=` in the URL, and that stays: a
 * refresh keeps it open and the address can be shared. What changes is how
 * the parameter gets there. This used to be an `<a href="?showPlayingStyle=…">`,
 * which is a crawlable link — one per style on every player page — and Google
 * was indexing each as a separate page. A button that writes the same URL with
 * `history.replaceState` (through the router) opens the same modal for a
 * person and offers a crawler nothing to follow. `replace` rather than `push`,
 * so closing the modal does not leave a step in the back-button history.
 */
export function PlayingStyleTrigger({
  style,
  className,
  children,
  ...props
}: React.ComponentProps<'button'> & { style: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const open = () => {
    const next = new URLSearchParams(searchParams);
    next.set(PLAYING_STYLE_PARAM, style);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <button type="button" onClick={open} className={className} {...props}>
      {children}
    </button>
  );
}
