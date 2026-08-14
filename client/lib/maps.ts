/**
 * Links out to a map, and the map is Yandex.
 *
 * ## One provider, chosen for where the users are
 *
 * Every academy on this platform is in Uzbekistan, and Yandex is what has the
 * street data there — the side roads, the stadium names, the traffic. A generic
 * link would send a parent to a provider that draws their district as an empty
 * rectangle, which is worse than no link. So the choice is made here, once,
 * rather than being an argument each call site can get wrong.
 *
 * ## Coordinates when there are any, the address when there are not
 *
 * A point is an answer; a region name is a search. Both are useful and they are
 * not interchangeable, so this returns null rather than inventing a destination
 * out of nothing — a caller with neither should render no link at all instead of
 * one that opens a map of the whole country.
 */

/** Yandex orders its pairs longitude-first, unlike almost everything else. */
function lonLat(latitude: number, longitude: number) {
  return `${longitude},${latitude}`;
}

/** Close enough to see which building it is. */
const PLACE_ZOOM = 17;

export interface MapTarget {
  latitude?: number | null;
  longitude?: number | null;
  /** Whatever the profile can say in words — name, region, district. */
  address?: string | null;
}

/**
 * A Yandex Maps URL for this academy, or null if it has said nothing about where
 * it is.
 *
 * The pin (`pt`) is what makes the destination arrive marked rather than merely
 * centred: a map scrolled to the right place still leaves the reader hunting for
 * which corner was meant.
 */
export function yandexMapsUrl({ latitude, longitude, address }: MapTarget): string | null {
  // Checked separately though the schema stores them together, because half a
  // pair would point at the Gulf of Guinea with total confidence.
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    const point = lonLat(latitude, longitude);
    return `https://yandex.com/maps/?ll=${point}&z=${PLACE_ZOOM}&pt=${point},pm2rdm`;
  }

  const text = address?.trim();
  if (text) return `https://yandex.com/maps/?text=${encodeURIComponent(text)}`;

  return null;
}

/**
 * The academy's location as one line of text — for the search fallback above and
 * for the label beside the link.
 *
 * Name first: "Shurtan FC, Qashqadaryo" finds the club, where "Qashqadaryo,
 * Guzar" finds a district and leaves the reader to spot it.
 */
export function locationText(parts: {
  name?: string | null;
  region?: string | null;
  district?: string | null;
}): string {
  return [parts.name, parts.region, parts.district].filter(Boolean).join(', ');
}
