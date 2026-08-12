'use client';

import * as React from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, MapPin } from 'lucide-react';
import { useI18n } from '@/components/layout/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';

/** Tashkent, as the opening view for an academy that has never set a point. */
const DEFAULT_CENTER: [number, number] = [41.2995, 69.2401];
const DEFAULT_ZOOM = 11;
/** Close enough to see which building it is, once a point exists. */
const PLACED_ZOOM = 16;

/**
 * Leaflet ships its marker icons as files resolved relative to the CSS, which a
 * bundler rewrites — the classic result is a map with invisible pins. Drawing
 * the pin as an inline SVG divIcon avoids the whole problem and lets it take the
 * app's own colour rather than Leaflet's blue.
 */
const pinIcon = L.divIcon({
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  html: `<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" class="text-primary drop-shadow">
      <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
    </svg>`,
});

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Where the academy is, chosen on a map.
 *
 * ## Why a map at all
 *
 * `region` and `district` are the buckets an academy is *listed* under — they
 * answer "show me academies in Fergana". They do not answer the question a
 * parent actually has, which is where to drive their child on Saturday morning.
 * A point does.
 *
 * ## OpenStreetMap, and loaded only here
 *
 * No API key, no billing account, no third-party script on every page. The whole
 * component is behind a `next/dynamic` boundary at its only call site, so a
 * player on a prepaid connection never downloads a map library to look at their
 * own card (§14).
 *
 * ## Two ways to answer, because they fail differently
 *
 * "Use my location" is one tap and exact — when the manager is standing at the
 * academy, which is often. It is useless from an office across town, and browser
 * geolocation is refused outright on an insecure origin or a denied permission.
 * So dragging the pin is always available, and the button is an accelerant
 * rather than the only route.
 */
export function LocationPicker({
  value,
  onChange,
  className,
}: {
  value: LatLng | null;
  onChange: (next: LatLng) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [locating, setLocating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const center: [number, number] = value ? [value.latitude, value.longitude] : DEFAULT_CENTER;

  function useMyLocation() {
    if (!navigator?.geolocation) {
      setError(t.academy?.locationUnavailable);
      return;
    }
    setLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange({
          latitude: position?.coords?.latitude,
          longitude: position?.coords?.longitude,
        });
      },
      () => {
        // Denied, unavailable, or timed out — all the same to the manager, who
        // just needs to drag the pin instead.
        setLocating(false);
        setError(t.academy?.locationDenied);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className={className}>
      <div className="border-border relative overflow-hidden rounded-xl border">
        <MapContainer
          center={center}
          zoom={value ? PLACED_ZOOM : DEFAULT_ZOOM}
          scrollWheelZoom={false}
          className="h-[280px] w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPlace onPlace={onChange} />
          <RecenterOn value={value} />
          {value && (
            <Marker
              position={[value.latitude, value.longitude]}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (event) => {
                  const { lat, lng } = event.target.getLatLng();
                  onChange({ latitude: lat, longitude: lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" loading={locating} onClick={useMyLocation}>
          <Crosshair aria-hidden /> {t.academy?.useMyLocation}
        </Button>

        {value ? (
          <span className="text-muted flex items-center gap-1 font-mono text-xs">
            <MapPin className="size-3.5" aria-hidden />
            {value.latitude?.toFixed(5)}, {value.longitude?.toFixed(5)}
          </span>
        ) : (
          <span className="text-muted text-xs">{t.academy?.tapMapHint}</span>
        )}
      </div>

      {error && (
        <Alert tone="warning" className="mt-2">
          {error}
        </Alert>
      )}
    </div>
  );
}

/** Tapping the map places the pin — the path for somebody not standing there. */
function ClickToPlace({ onPlace }: { onPlace: (next: LatLng) => void }) {
  useMapEvents({
    click: (event) => onPlace({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
  });
  return null;
}

/**
 * Follows the value when it moves for a reason other than dragging — pressing
 * "use my location" is the case that matters, where the point can be far outside
 * the current view and would otherwise be placed off-screen.
 */
function RecenterOn({ value }: { value: LatLng | null }) {
  const map = useMap();
  const lat = value?.latitude;
  const lng = value?.longitude;

  React.useEffect(() => {
    if (lat == null || lng == null) return;
    map.setView([lat, lng], Math.max(map.getZoom(), PLACED_ZOOM));
  }, [map, lat, lng]);

  return null;
}
