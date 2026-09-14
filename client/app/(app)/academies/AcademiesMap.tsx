'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as React from 'react';
import type { MappedAcademy } from '@/lib/academies-map';

/** The country, as the opening view when there is nothing to fit to. */
const UZBEKISTAN_CENTER: [number, number] = [41.4, 64.6];
const COUNTRY_ZOOM = 6;
/** No closer than a district, however tightly the pins cluster. */
const MAX_FIT_ZOOM = 12;

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

/** The pin: the academy's own logo in a ring, or a building glyph without one. */
function pinHtml(academy: MappedAcademy): string {
  const face = academy.logoUrl
    ? `<img src="${escapeHtml(academy.logoUrl)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block" />`
    : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/></svg>`;
  return `<span class="fs-pin"><span class="fs-pin-face">${face}</span></span>`;
}

/**
 * Every located academy on one map.
 *
 * ## Leaflet, driven by hand
 *
 * The map is created once and the pins are plain Leaflet markers with a
 * `divIcon` — a few dozen small DOM nodes, not a React component each. The
 * popup is a string Leaflet mounts on demand, so nothing renders until a pin
 * is pressed or hovered. The directory has ~50 academies; if it ever has
 * thousands, a cluster layer slots in here without the page changing.
 *
 * OpenStreetMap tiles, like the manager's own pin picker: no key, no script on
 * pages that do not show a map. The whole file is behind a `next/dynamic`
 * boundary (`AcademiesMapSection`), so the list arrives first and the map
 * fills its box when it is ready.
 */
export function AcademiesMap({
  academies,
  openLabel,
}: {
  academies: MappedAcademy[];
  openLabel: string;
}) {
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const layerRef = React.useRef<L.LayerGroup | null>(null);

  React.useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = L.map(boxRef.current, { scrollWheelZoom: false }).setView(
      UZBEKISTAN_CENTER,
      COUNTRY_ZOOM,
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const points: [number, number][] = [];
    for (const academy of academies) {
      const icon = L.divIcon({
        className: '',
        html: pinHtml(academy),
        iconSize: [40, 44],
        iconAnchor: [20, 44],
        popupAnchor: [0, -40],
      });
      const marker = L.marker([academy.latitude, academy.longitude], {
        icon,
        title: academy.name,
      });
      marker.bindPopup(
        `<div class="fs-pin-card">
          ${academy.logoUrl ? `<img src="${escapeHtml(academy.logoUrl)}" alt="" />` : ''}
          <div class="fs-pin-card-body">
            <strong>${escapeHtml(academy.name)}</strong>
            ${academy.region ? `<span>${escapeHtml(academy.region)}</span>` : ''}
            <a href="/academies/${encodeURIComponent(academy.id)}">${escapeHtml(openLabel)}</a>
          </div>
        </div>`,
        { closeButton: false, maxWidth: 260 },
      );
      marker.on('mouseover', () => marker.openPopup());
      marker.addTo(layer);
      points.push([academy.latitude, academy.longitude]);
    }
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: MAX_FIT_ZOOM });
    }
  }, [academies, openLabel]);

  return (
    <div
      ref={boxRef}
      role="region"
      aria-label={openLabel}
      className="border-border bg-surface-2 h-[320px] w-full overflow-hidden rounded-xl border sm:h-[420px]"
    />
  );
}
