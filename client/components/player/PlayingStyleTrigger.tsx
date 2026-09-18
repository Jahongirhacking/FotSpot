'use client';

import { useModalParam } from '@/hooks/useModalParam';
import { PLAYING_STYLE_PARAM } from '@/lib/player-url';
import * as React from 'react';

/**
 * Opens the playing-style modal for `style`.
 *
 * The modal is driven by `?showPlayingStyle=` in the URL, and that stays: a
 * refresh keeps it open and the address can be shared. What changes is how
 * the parameter gets there. This used to be an `<a href="?showPlayingStyle=…">`,
 * which is a crawlable link — one per style on every player page — and Google
 * was indexing each as a separate page. A button that writes the same URL
 * through the router opens the same modal for a person and offers a crawler
 * nothing to follow. It pushes, so the browser's Back closes the modal, and
 * the modal's own close replaces, so Back after that does not reopen it —
 * see `useModalParam`.
 */
export function PlayingStyleTrigger({
  style,
  className,
  children,
  ...props
}: React.ComponentProps<'button'> & { style: string }) {
  const modal = useModalParam(PLAYING_STYLE_PARAM);

  return (
    <button type="button" onClick={() => modal.open(style)} className={className} {...props}>
      {children}
    </button>
  );
}
