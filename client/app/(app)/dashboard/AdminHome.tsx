import Link from 'next/link';
import { Building2, Flag, ShieldCheck, ScrollText, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';

export function AdminHome({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{isSuperAdmin ? 'Super admin' : 'Admin'}</h1>
        <p className="text-muted text-sm">
          {isSuperAdmin
            ? 'Full platform control, including roles and audit logs.'
            : 'Verification and moderation. You cannot create admins or change platform settings.'}
        </p>
      </div>

      {/* README §11.5 — child-safety reports bypass the queue and page a human. The
          escalation path must exist before launch, not after the first incident. */}
      <Alert tone="danger" title="Child-safety reports come first">
        Any report involving a minor&apos;s safety is a sub-one-hour response target and jumps every
        other queue.
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2">
        <AdminTile
          icon={ShieldCheck}
          title="Verification queue"
          description="Approve or reject coaches and academies. Every decision is written to the audit log with your name on it."
          href="/admin/verification"
        />
        <AdminTile
          icon={Building2}
          title="Academies"
          description="Create, edit and archive academies. Only the platform team onboards them."
          href="/admin/academies"
        />
        <AdminTile
          icon={Flag}
          title="Moderation queue"
          description="Reports against users, media, academies and coaches."
          href="/admin/moderation"
        />
        {isSuperAdmin && (
          <>
            <AdminTile
              icon={KeyRound}
              title="Roles & permissions"
              description="Grant or revoke admin access and manage the permission catalogue."
              href="/admin/admins"
            />
            <AdminTile
              icon={ScrollText}
              title="Audit log"
              description="Every privileged action, attributed to the admin who took it."
              href="/admin/audit-logs"
            />
          </>
        )}
      </div>
    </div>
  );
}

function AdminTile({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="bg-primary/12 text-primary mb-1 grid size-9 place-items-center rounded-lg">
          <Icon className="size-4" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" size="sm">
          <Link href={href}>Open</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
