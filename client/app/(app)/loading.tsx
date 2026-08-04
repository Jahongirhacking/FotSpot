import { getServerT } from '@/lib/i18n/server';
import { Skeleton } from '@/components/ui/Feedback';

export default async function AppLoading() {
  const { t } = await getServerT();

  return (
    <div className="space-y-4" aria-busy aria-label={t.common.loading}>
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-72" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
