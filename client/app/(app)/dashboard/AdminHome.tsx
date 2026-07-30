import Link from 'next/link';
import { Building2, Flag, KeyRound, ScrollText, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import type { Dictionary } from '@/lib/i18n';

/**
 * Admin console home.
 *
 * NOTE: there is deliberately no verification queue any more. Both things it used
 * to hold moved to where the knowledge actually is — academies are created
 * directly by admins (README §1.10), and coaches are taken on by the academy that
 * hires them, which vouches for them (§1.9). A queue that re-reviews a decision
 * already made by a better-informed party is ceremony, not safety.
 *
 * The verification work that will genuinely belong to admins is §12.1 age and
 * document review, which is Phase 1.5 and not built yet. When it lands, it goes
 * here.
 */
export function AdminHome({ isSuperAdmin, t }: { isSuperAdmin: boolean; t: Dictionary }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">
            {isSuperAdmin ? t.roles.super_admin : t.roles.admin}
          </h1>
          <Badge variant={isSuperAdmin ? 'primary' : 'neutral'}>{t.admin.console}</Badge>
        </div>
        <p className="text-muted mt-1 text-sm">
          {isSuperAdmin ? t.dashboard.superAdminSubtitle : t.dashboard.adminSubtitle}
        </p>
      </div>

      {/* README §11.5 — child-safety reports bypass every other queue. */}
      <Alert tone="danger" title={t.dashboard.childSafetyFirst}>
        {t.dashboard.childSafetyBody}
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2">
        <AdminTile
          icon={Building2}
          title={t.admin.manageAcademies}
          description={t.admin.manageAcademiesHint}
          href="/admin/academies"
          cta={t.common.open}
        />
        <AdminTile
          icon={Users}
          title={t.admin.users}
          description={t.admin.usersHint}
          href="/admin/users"
          cta={t.common.open}
          badge={isSuperAdmin ? undefined : t.admin.readOnly}
        />
        <AdminTile
          icon={Flag}
          title={t.admin.moderation}
          description={t.admin.moderationHint}
          href="/admin/moderation"
          cta={t.common.open}
        />
        <AdminTile
          icon={ScrollText}
          title={t.admin.auditLog}
          description={t.admin.auditLogHint}
          href="/admin/audit-logs"
          cta={t.common.open}
        />

        {isSuperAdmin && (
          <>
            <AdminTile
              icon={KeyRound}
              title={t.admin.manageAdmins}
              description={t.admin.manageAdminsHint}
              href="/admin/admins"
              cta={t.common.open}
            />
            <AdminTile
              icon={KeyRound}
              title={t.admin.rolesPermissions}
              description={t.admin.rolesPermissionsHint}
              href="/admin/roles"
              cta={t.common.open}
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
  cta,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
  cta: string;
  badge?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="bg-primary/12 text-primary mb-1 grid size-9 place-items-center rounded-lg">
          <Icon className="size-4" />
        </div>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {title}
          {badge && <Badge variant="neutral">{badge}</Badge>}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" size="sm">
          <Link href={href}>{cta}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
