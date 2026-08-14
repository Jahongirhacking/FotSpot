'use client';

import dynamic from 'next/dynamic';
import { MapPin, ExternalLink } from 'lucide-react';
import { useI18n } from '@/components/layout/I18nProvider';
import { yandexMapsUrl } from '@/lib/maps';

/**
 * `ssr: false` is not allowed in a Server Component (Next 16), and Leaflet
 * touches `window` at import time — so this thin client wrapper exists to hold
 * the dynamic import on behalf of the academy page, which is a Server Component.
 *
 * The placeholder matches the map's height so the card does not resize under the
 * reader when tiles arrive.
 */
const AcademyMapView = dynamic(
  () => import('@/components/academy/AcademyMapView').then((mod) => mod.AcademyMapView),
  {
    ssr: false,
    loading: () => <div className="bg-surface-2 h-[260px] w-full animate-pulse" />,
  },
);

/**
 * Where the academy is, for somebody deciding whether they can get there.
 *
 * Renders nothing without a point. An empty map centred on the country would
 * take the same space as a real answer while telling the reader less than the
 * region line already does — and worse, it looks like a located academy until
 * you read it.
 *
 * The link out matters as much as the map: a pin says where, and a maps app is
 * what turns that into a route. It goes to Yandex, which is the provider with
 * real street data for Uzbekistan — see lib/maps.ts.
 */
export function AcademyMap({
  latitude,
  longitude,
  name,
}: {
  latitude?: number | null;
  longitude?: number | null;
  name: string;
}) {
  const { t } = useI18n();

  // Null together, by the schema's own note — but checked separately, because a
  // half-set pair would otherwise place a pin in the sea off west Africa.
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;

  return (
    <div>
      <div className="border-border overflow-hidden rounded-xl border">
        <AcademyMapView latitude={latitude} longitude={longitude} label={name} />
      </div>

      <div className="text-muted mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden />
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </span>
        <a
          className="text-primary inline-flex items-center gap-1 hover:underline"
          href={yandexMapsUrl({ latitude, longitude, address: name }) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.academy?.openInMaps} <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}
