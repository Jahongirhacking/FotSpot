'use client';

import * as React from 'react';
import { Laptop, LogOut, Smartphone } from 'lucide-react';
import type { DeviceSession } from '@/lib/api/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Feedback';
import { relativeTime } from '@/lib/utils';
import { useI18n } from '@/components/layout/I18nProvider';

/**
 * Device list from README §1.21.
 *
 * The backend exposes per-device sessions but only offers "log out this device" and
 * "log out everywhere" — there is no revoke-by-id route yet, so this offers the two
 * that exist rather than a button that would 404.
 */
export function SessionList({
  devices,
  currentSessionId,
}: {
  devices: DeviceSession[];
  currentSessionId: string | null;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = React.useState(false);

  async function logoutEverywhere() {
    setBusy(true);
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allDevices: true }),
    });
    window.location.assign('/');
  }

  if (devices.length === 0) {
    return <Alert tone="info">{t.settings.noOtherSessions}</Alert>;
  }

  return (
    <div className="space-y-4">
      <ul className="divide-border divide-y">
        {devices.map((device) => {
          const isMobile = /mobile|android|iphone/i.test(device.userAgent ?? '');
          const Icon = isMobile ? Smartphone : Laptop;

          return (
            <li key={device.id} className="flex items-start gap-3 py-3">
              <Icon className="text-muted mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {describeDevice(device.userAgent)}
                  {device.id === currentSessionId && (
                    <Badge variant="primary" className="ml-2">
                      This device
                    </Badge>
                  )}
                </p>
                <p className="text-muted text-xs">
                  Last used {relativeTime(device.lastUsedAt)}
                  {device.ipAddress ? ` · ${device.ipAddress}` : ''}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <Button variant="danger" loading={busy} onClick={logoutEverywhere}>
        <LogOut aria-hidden /> Sign out everywhere
      </Button>
    </div>
  );
}

function describeDevice(userAgent?: string | null): string {
  if (!userAgent) return 'Unknown device';
  if (/android/i.test(userAgent)) return 'Android device';
  if (/iphone|ipad/i.test(userAgent)) return 'iPhone or iPad';
  if (/chrome/i.test(userAgent)) return 'Chrome browser';
  if (/firefox/i.test(userAgent)) return 'Firefox browser';
  if (/safari/i.test(userAgent)) return 'Safari browser';
  return 'Web browser';
}
