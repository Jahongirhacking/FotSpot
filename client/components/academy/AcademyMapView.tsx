'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';

/**
 * Close enough to see which building it is. The picker opens wider because a
 * manager is still searching; a visitor already knows the town and wants the
 * street.
 */
const ZOOM = 16;

/**
 * Leaflet resolves its marker images relative to the CSS, which a bundler
 * rewrites — the classic result is a map with invisible pins. An inline SVG
 * divIcon sidesteps that and takes the app's own colour. Kept identical to
 * `LocationPicker`'s, so the pin a manager drops is the pin a visitor sees.
 */
const pinIcon = L.divIcon({
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  html: `<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" class="text-primary drop-shadow">
      <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/>
    </svg>`,
});

/**
 * The academy's point, to look at rather than to move.
 *
 * Dragging and zooming stay on — a parent works out a route by looking around
 * the pin — but the scroll wheel does not zoom. A map that swallows the scroll
 * gesture traps the page half way down on a laptop, and this map is one item on
 * a profile, not the reason anybody opened it.
 */
export function AcademyMapView({
  latitude,
  longitude,
  label,
}: {
  latitude: number;
  longitude: number;
  label: string;
}) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={ZOOM}
      scrollWheelZoom={false}
      // z-0 keeps Leaflet's stacking context from rising over dialogs and menus.
      className="z-[0] h-[260px] w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[latitude, longitude]} icon={pinIcon} title={label} />
    </MapContainer>
  );
}
