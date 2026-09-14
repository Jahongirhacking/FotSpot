'use client';

import dynamic from 'next/dynamic';
import { Map as MapIcon } from 'lucide-react';
import { useI18n } from '@/components/layout/I18nProvider';
import { Skeleton } from '@/components/ui/Feedback';
import type { MappedAcademy } from '@/lib/academies-map';

/**
 * Loaded only in the browser and only on this page: Leaflet reads `window` at
 * import, and a phone opening the directory should have the list before the
 * map library arrives. The box is drawn at its final height from the start so
 * nothing moves when the map lands.
 */
const AcademiesMap = dynamic(() => import('./AcademiesMap').then((mod) => mod.AcademiesMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[320px] w-full rounded-xl sm:h-[420px]" />,
});

export function AcademiesMapSection({ academies }: { academies: MappedAcademy[] }) {
  const { t } = useI18n();
  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <MapIcon className="text-primary size-4.5" aria-hidden /> {t.academy.mapTitle}
        </h2>
        <p className="text-muted text-sm">{t.academy.mapHint}</p>
      </div>
      {academies.length === 0 ? (
        <p className="text-muted border-border rounded-xl border border-dashed p-4 text-sm">
          {t.academy.noneOnMap}
        </p>
      ) : (
        <AcademiesMap academies={academies} openLabel={t.academy.openProfile} />
      )}
    </section>
  );
}
