'use client';

import * as React from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '@/lib/api/client';

/**
 * One Socket.IO connection for the session (client/CLAUDE.md §6 — never one per
 * component). Module-scoped so a remount reuses the existing connection.
 *
 * The socket carries no data we trust: it only invalidates the notifications query,
 * which re-reads the persisted rows. That keeps the badge and the list in sync by
 * construction, matching the backend's own "never push without persisting" rule.
 */
let socket: Socket | null = null;
let refCount = 0;

function socketUrl() {
  // API_BASE is `http://host/api/v1`; the gateway namespace hangs off the origin.
  try {
    return new URL(API_BASE).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

export function useNotificationSocket() {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    let cancelled = false;

    async function connect() {
      // The access token is httpOnly, so it has to be fetched from the server to
      // hand to Socket.IO's auth payload. Short-lived and never persisted in JS.
      const response = await fetch('/api/auth/socket-token');
      if (!response.ok || cancelled) return;
      const { token } = (await response.json()) as { token?: string };
      if (!token || cancelled) return;

      if (!socket) {
        socket = io(`${socketUrl()}/notifications`, {
          auth: { token },
          transports: ['websocket'],
          reconnectionDelay: 2000,
        });
      }
      refCount += 1;

      socket.on('notification', () => {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      });
    }

    void connect();

    return () => {
      cancelled = true;
      refCount = Math.max(0, refCount - 1);
      if (refCount === 0 && socket) {
        socket.disconnect();
        socket = null;
      }
    };
  }, [queryClient]);
}
