import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Gauge } from 'lucide-react';
import { getSession } from '@/lib/session';
import { isSuperAdminActing } from '@/lib/roles';
import { getServerT } from '@/lib/i18n/server';
import { tariffs, type TariffPlan } from '@/lib/api/resources';
import { Alert } from '@/components/ui/Feedback';
import { TariffPlansManager } from './TariffPlansManager';

export const metadata: Metadata = { title: 'Tariff plans' };

/**
 * The five numbers that decide what every account may do — super admin only.
 *
 * A plain admin verifies and moderates; changing what a paying tier is worth is
 * a platform-wide setting, which §1.2 keeps with the super admin. The backend
 * enforces it on `PATCH /tariff-plans/:tier`; this screen explains it rather
 * than pretending the page does not exist.
 */
export default async function TariffPlansPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/admin/tariff-plans');

  const { t } = await getServerT();

  if (!isSuperAdminActing(session.activeRole)) {
    return <Alert tone="warning">{t.plans.onlySuperAdmin}</Alert>;
  }

  const plans = await tariffs
    .list({ token: session.accessToken, activeRole: session.activeRole, cache: 'no-store' })
    .catch(() => [] as TariffPlan[]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Gauge className="text-primary size-5" aria-hidden /> {t.plans.title}
        </h1>
        <p className="text-muted text-sm">{t.plans.hint}</p>
      </header>

      <TariffPlansManager initial={plans} />
    </div>
  );
}
