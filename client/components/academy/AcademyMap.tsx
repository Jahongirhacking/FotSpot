import { MapPin } from 'lucide-react';
import type { Locale } from '@/lib/i18n/config';
import { yandexMapEmbedUrl, yandexMapsUrl } from '@/lib/maps';
import { Button } from '../ui/Button';

/**
 * Where the academy is, for somebody deciding whether they can get there.
 *
 * An embedded Yandex map rather than a Leaflet one. Leaflet drew
 * OpenStreetMap tiles, which leave many Uzbek districts as grey blocks with
 * no street names — a located academy that looked unlocated. Yandex has the
 * streets, the stadium names and the bus stops, so the reader sees the same
 * map the link below opens. It is an iframe: nothing to bundle, nothing to
 * hydrate, and the tiles never touch our servers. The manager's own map — the
 * one they drop the pin on — is a different component (`LocationPicker`) and
 * is untouched by this.
 *
 * Renders nothing without a point. An empty map centred on the country would
 * take the same space as a real answer while telling the reader less than the
 * region line already does.
 *
 * Server Component: there is no state here, only a URL and a link.
 */
export function AcademyMap({
  latitude,
  longitude,
  name,
  locale,
  openLabel,
}: {
  latitude?: number | null;
  longitude?: number | null;
  name: string;
  locale: Locale;
  openLabel: string;
}) {
  // Null together, by the schema's own note — but checked separately, because a
  // half-set pair would otherwise place a pin in the sea off west Africa.
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;

  const href = yandexMapsUrl({ latitude, longitude, address: name }) ?? undefined;

  return (
    <div>
      <div className="border-border bg-surface-2 overflow-hidden rounded-xl border">
        <iframe
          src={yandexMapEmbedUrl({ latitude, longitude, locale })}
          title={name}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          className="block h-[260px] w-full border-0"
        />
      </div>

      <div className="mt-2">
        <Button asChild className="w-full">
          <a href={href} target="_blank" rel="noopener noreferrer">
            <MapPin className="size-3.5" aria-hidden />
            {openLabel}
          </a>
        </Button>
      </div>
    </div>
  );
}
