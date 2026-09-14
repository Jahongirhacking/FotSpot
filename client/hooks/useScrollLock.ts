'use client';

import * as React from 'react';

/**
 * Freezes the page behind a full-screen overlay, without the page jumping.
 *
 * ## Why the root element, not the body
 *
 * `html, body { overflow-x: hidden }` in globals.css makes the *root* the
 * element whose overflow reaches the viewport, so `body.style.overflow =
 * 'hidden'` clipped the body and left the document scrolling — and its
 * scrollbar drawn beside the overlay's own. The lock has to sit on the root.
 *
 * ## Why the padding
 *
 * Hiding the page's scrollbar hands its width back to the layout, and every
 * centred column shifts by half of it. The width the bar was taking is put
 * back as padding on the root for as long as the lock holds, so nothing moves;
 * on a phone, where the bar is an overlay, it measures zero and nothing is
 * added.
 *
 * Restores exactly the inline values it found, so a lock opened over another
 * lock — or over a page that had set its own — hands back what was there.
 */
export function useScrollLock(locked = true) {
  React.useLayoutEffect(() => {
    if (!locked) return;
    const root = document.documentElement;
    const body = document.body;
    const previous = {
      rootOverflow: root.style.overflow,
      rootPaddingRight: root.style.paddingRight,
      bodyOverflow: body.style.overflow,
    };
    const scrollbar = window.innerWidth - root.clientWidth;

    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;

    return () => {
      root.style.overflow = previous.rootOverflow;
      root.style.paddingRight = previous.rootPaddingRight;
      body.style.overflow = previous.bodyOverflow;
    };
  }, [locked]);
}
