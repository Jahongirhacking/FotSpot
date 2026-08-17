import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ScrollText } from 'lucide-react';
import { getSession } from '@/lib/session';
import { isAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { admin, type AuditLogEntry } from '@/lib/api/resources';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Audit log' };

/** Read-only by design: an audit trail you can edit is not an audit trail. */
export default async function AuditLogPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/audit-logs');

  const { t } = await getServerT();
  const isAdmin = isAdminActing(session?.activeRole);
  if (!isAdmin) return <Alert tone="warning">{t.academy.adminOnly}</Alert>;

  const entries = await admin
    .auditLogs({ token: session?.accessToken, activeRole: session?.activeRole, cache: 'no-store' })
    .catch(() => [] as AuditLogEntry[]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ScrollText className="text-primary size-5" aria-hidden /> {t.admin.auditLog}
        </h1>
        <p className="text-muted text-sm">{t.admin.auditLogHint}</p>
      </header>

      {entries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={t.admin.noAuditEntries}
          description={t.admin.noAuditEntriesHint}
        />
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry?.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 p-3">
                  <Badge variant="neutral" className="shrink-0 font-mono">
                    {entry?.action}
                  </Badge>
                  <span className="text-muted min-w-0 flex-1 truncate font-mono text-xs">
                    {entry?.user
                      ? [entry?.user.firstName, entry?.user.lastName].filter(Boolean).join(' ') ||
                        entry?.user.email ||
                        entry?.user.id.slice(0, 8)
                      : 'system'}
                    {entry?.meta ? ` · ${JSON.stringify(entry?.meta)}` : ''}
                  </span>
                  <span className="text-muted shrink-0 text-xs">
                    {relativeTime(entry?.createdAt)}
                  </span>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
