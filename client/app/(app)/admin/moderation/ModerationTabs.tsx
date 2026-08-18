'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flag, Video } from 'lucide-react';
import { useI18n } from '@/components/layout/I18nProvider';
import { cn } from '@/lib/utils';

/**
 * The two moderation queues, side by side.
 *
 * They are genuinely different jobs and should not be one list. A report is a
 * complaint about something already published, worked oldest-first because the
 * oldest one has been wrong for longest. Video review is the gate every upload
 * passes through before anyone sees it, worked newest-first because the person
 * waiting is the player who just pressed upload. Merging them would give one
 * screen two orderings and two meanings of "done".
 *
 * A client island only because the active tab depends on the current path.
 */
export function ModerationTabs() {
  const { t } = useI18n();
  const pathname = usePathname();

  const tabs = [
    { href: '/admin/moderation', label: t.admin.reviewReports, icon: Flag },
    { href: '/admin/moderation/videos', label: t.admin.videoReview, icon: Video },
  ];

  return (
    <nav className="flex gap-1.5" aria-label={t.admin.moderation}>
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:border-primary/50',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
