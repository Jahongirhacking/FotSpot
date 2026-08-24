/**
 * Uzbekistan's provinces and the districts inside each — the only region and
 * district values this platform accepts.
 *
 * ## Why a pair, not two independent fields
 *
 * `region` and `district` were free strings validated separately, so
 * "Namangan / Xiva" stored happily: a district that exists, in a province that
 * does not contain it. Search filters on region, so a player filed that way is
 * findable under a province they are not in and invisible under the one they
 * are. Validating the *pair* is the only check that catches it, and it has to
 * exist on the server — the picker below cannot be the rule, only its
 * convenience.
 *
 * ## No "tumani" suffix
 *
 * The word means "district" and every entry would carry it, so it identifies
 * nothing. Names are stored exactly as displayed, which spares every screen a
 * trimming step and keeps the stored value readable in a database client.
 *
 * ## Apostrophes are U+2018/U+2019, deliberately
 *
 * `Qoraqalpog‘iston`, `Ellikqal’a` and the rest use the Uzbek Latin
 * turned/straight comma characters rather than ASCII `'`. Two spellings of one
 * district would compare unequal and split the same place into two, so the list
 * is the single source of the spelling and `normaliseRegion`/`normaliseDistrict`
 * fold ASCII input onto it.
 */
export const UZBEKISTAN: Record<string, readonly string[]> = {
  'Qoraqalpog‘iston Respublikasi': [
    'Amudaryo',
    'Beruniy',
    'Bo‘zatov',
    'Chimboy',
    'Ellikqal’a',
    'Kegeyli',
    'Mo‘ynoq',
    'Nukus',
    'Qanliko‘l',
    'Qo‘ng‘irot',
    'Qorao‘zak',
    'Shumanay',
    'Taxtako‘pir',
    'To‘rtko‘l',
    'Xo‘jayli',
    'Taxiatosh',
  ],
  'Andijon viloyati': [
    'Andijon',
    'Asaka',
    'Baliqchi',
    'Buloqboshi',
    'Bo‘ston',
    'Izboskan',
    'Jalaquduq',
    'Marhamat',
    'Oltinko‘l',
    'Paxtaobod',
    'Qo‘rg‘ontepa',
    'Shahrixon',
    'Ulug‘nor',
    'Xo‘jaobod',
  ],
  'Buxoro viloyati': [
    'Buxoro',
    'G‘ijduvon',
    'Jondor',
    'Kogon',
    'Olot',
    'Peshku',
    'Qorako‘l',
    'Qorovulbozor',
    'Romitan',
    'Shofirkon',
    'Vobkent',
  ],
  'Jizzax viloyati': [
    'Arnasoy',
    'Baxmal',
    'Do‘stlik',
    'Forish',
    'G‘allaorol',
    'Mirzacho‘l',
    'Paxtakor',
    'Sharof Rashidov',
    'Yangiobod',
    'Zafarobod',
    'Zarbdor',
  ],
  'Qashqadaryo viloyati': [
    'Chiroqchi',
    'Dehqonobod',
    'G‘uzor',
    'Kasbi',
    'Kitob',
    'Koson',
    'Ko‘kdala',
    'Mirishkor',
    'Muborak',
    'Nishon',
    'Qamashi',
    'Qarshi',
    'Shahrisabz',
    'Yakkabog‘',
  ],
  'Navoiy viloyati': [
    'Karmana',
    'Konimex',
    'Navbahor',
    'Nurota',
    'Qiziltepa',
    'Tomdi',
    'Uchquduq',
    'Xatirchi',
  ],
  'Namangan viloyati': [
    'Chortoq',
    'Chust',
    'Kosonsoy',
    'Mingbuloq',
    'Namangan',
    'Norin',
    'Pop',
    'To‘raqo‘rg‘on',
    'Uchqo‘rg‘on',
    'Uychi',
    'Yangiqo‘rg‘on',
  ],
  'Samarqand viloyati': [
    'Bulung‘ur',
    'Ishtixon',
    'Jomboy',
    'Kattaqo‘rg‘on',
    'Narpay',
    'Nurobod',
    'Oqdaryo',
    'Paxtachi',
    'Payariq',
    'Pastdarg‘om',
    'Samarqand',
    'Toyloq',
    'Urgut',
    'Qo‘shrabot',
  ],
  'Sirdaryo viloyati': [
    'Boyovut',
    'Guliston',
    'Mirzaobod',
    'Oqoltin',
    'Sayxunobod',
    'Sardoba',
    'Sirdaryo',
    'Xovos',
  ],
  'Surxondaryo viloyati': [
    'Angor',
    'Bandixon',
    'Boysun',
    'Denov',
    'Jarqo‘rg‘on',
    'Muzrabot',
    'Oltinsoy',
    'Qiziriq',
    'Qumqo‘rg‘on',
    'Sariosiyo',
    'Sherobod',
    'Sho‘rchi',
    'Termiz',
    'Uzun',
  ],
  'Toshkent viloyati': [
    'Bekobod',
    'Bo‘ka',
    'Bo‘stonliq',
    'Chinoz',
    'Oqqo‘rg‘on',
    'Ohangaron',
    'Parkent',
    'Piskent',
    'Quyichirchiq',
    'Yangiyo‘l',
    'Yuqorichirchiq',
    'Zangiota',
    'O‘rta Chirchiq',
  ],
  'Farg‘ona viloyati': [
    'Bag‘dod',
    'Beshariq',
    'Buvayda',
    'Dang‘ara',
    'Furqat',
    'Farg‘ona',
    'Oltiariq',
    'O‘zbekiston',
    'Qo‘shtepa',
    'Quva',
    'Rishton',
    'So‘x',
    'Toshloq',
    'Uchko‘prik',
    'Yozyovon',
  ],
  'Xorazm viloyati': [
    'Bog‘ot',
    'Gurlan',
    'Hazorasp',
    'Qo‘shko‘pir',
    'Shovot',
    'Tuproqqal’a',
    'Urganch',
    'Xiva',
    'Xonqa',
    'Yangiariq',
    'Yangibozor',
  ],
  'Toshkent shahri': [
    'Bektemir',
    'Chilonzor',
    'Mirobod',
    'Mirzo Ulug‘bek',
    'Sergeli',
    'Shayxontohur',
    'Uchtepa',
    'Yakkasaroy',
    'Yunusobod',
    'Yashnobod',
    'Olmazor',
    'Yangihayot',
  ],
};

/** Province names, in the order the pickers list them. */
export const UZBEK_REGIONS = Object.keys(UZBEKISTAN);

export type UzbekRegion = string;

/** Districts of one province, or an empty list for an unknown province. */
export function districtsOf(region?: string | null): readonly string[] {
  if (!region) return [];
  return UZBEKISTAN[region] ?? [];
}

/**
 * Folds the several ways an apostrophe can be typed onto one, and lowercases.
 *
 * A form posts what the picker gave it, so this is for everything else: an
 * import, a fixture, somebody testing with curl. Without it `Qorao'zak` typed
 * with an ASCII quote is a different district from `Qorao‘zak`, and the pair
 * check would reject a value that is plainly correct.
 */
function fold(value: string): string {
  return value
    .trim()
    .replace(/[‘’ʻʼ`´]/g, "'")
    .toLocaleLowerCase('uz');
}

/** `fold`, plus the administrative noun some callers append. */
function foldLoose(value: string): string {
  return fold(value).replace(/\s+(tumani|viloyati|shahri|respublikasi)$/i, '');
}

/**
 * Matches exactly first, then tolerantly — and refuses a tolerant match that is
 * ambiguous.
 *
 * `Toshkent shahri` and `Toshkent viloyati` are different places that both end
 * up as "toshkent" once the noun is dropped, so a purely tolerant match resolved
 * the city to the region and then rejected every district in it. Exact wins; a
 * loose match counts only when precisely one candidate answers to it, so a bare
 * "Toshkent" is refused as the genuine ambiguity it is.
 */
function resolve(candidates: readonly string[], value: string): string | null {
  const wanted = fold(value);
  const exact = candidates.find((name) => fold(name) === wanted);
  if (exact) return exact;

  const loose = foldLoose(value);
  const matches = candidates.filter((name) => foldLoose(name) === loose);
  return matches.length === 1 ? matches[0] : null;
}

/** The canonical spelling of a province, or null if it is not one. */
export function normaliseRegion(region?: string | null): string | null {
  if (!region) return null;
  return resolve(UZBEK_REGIONS, region);
}

/** The canonical spelling of a district *within a province*, or null. */
export function normaliseDistrict(region: string, district?: string | null): string | null {
  if (!district) return null;
  return resolve(districtsOf(region), district);
}

/**
 * Whether this district really belongs to this province.
 *
 * Both empty is fine — neither field is required, and a player who has not said
 * where they are is not an error. A district *without* a region is not fine: it
 * cannot be checked against anything, and an unchecked district is exactly the
 * "Namangan / Xiva" case this exists to stop.
 */
export function isValidRegionDistrict(region?: string | null, district?: string | null): boolean {
  const hasRegion = Boolean(region?.trim());
  const hasDistrict = Boolean(district?.trim());

  if (!hasRegion && !hasDistrict) return true;
  if (!hasRegion) return false;

  const canonicalRegion = normaliseRegion(region);
  if (!canonicalRegion) return false;
  if (!hasDistrict) return true;

  return normaliseDistrict(canonicalRegion, district) !== null;
}

/**
 * Roughly where each province is, as a point.
 *
 * ## Why an approximation is the honest answer here
 *
 * A player's profile stores a *place name* — province, optionally district —
 * because that is as much as the platform asks a fourteen-year-old for. An
 * academy stores real coordinates, because it is a building somebody drives to.
 * Ranking trials by proximity therefore needs one end approximated, and the
 * province's administrative centre is the least-wrong point available: it is
 * where most of the province's population is, and it is a fact rather than a
 * guess about the individual.
 *
 * These are the provincial capitals, to four decimal places (~10m — far finer
 * than the claim deserves, and kept only so the numbers are recognisable).
 *
 * **Only ever used for ordering**, never displayed and never stored on a player.
 * The distance it produces is a sorting key, not a statement that a player lives
 * in their provincial capital — which is why `distanceKm` is never surfaced in
 * the UI.
 */
const REGION_CENTRES: Record<string, { latitude: number; longitude: number }> = {
  'Qoraqalpog‘iston Respublikasi': { latitude: 42.4531, longitude: 59.6103 }, // Nukus
  'Andijon viloyati': { latitude: 40.7821, longitude: 72.3442 },
  'Buxoro viloyati': { latitude: 39.7747, longitude: 64.4286 },
  'Jizzax viloyati': { latitude: 40.1158, longitude: 67.8422 },
  'Qashqadaryo viloyati': { latitude: 38.8611, longitude: 65.7887 }, // Qarshi
  'Navoiy viloyati': { latitude: 40.0844, longitude: 65.3792 },
  'Namangan viloyati': { latitude: 40.9983, longitude: 71.6726 },
  'Samarqand viloyati': { latitude: 39.627, longitude: 66.975 },
  'Sirdaryo viloyati': { latitude: 40.4897, longitude: 68.7842 }, // Guliston
  'Surxondaryo viloyati': { latitude: 37.2242, longitude: 67.2783 }, // Termiz
  'Toshkent viloyati': { latitude: 41.0058, longitude: 69.6294 }, // Nurafshon
  'Farg‘ona viloyati': { latitude: 40.3864, longitude: 71.7864 },
  'Xorazm viloyati': { latitude: 41.55, longitude: 60.6333 }, // Urganch
  'Toshkent shahri': { latitude: 41.2995, longitude: 69.2401 },
};

/**
 * A point for a player's stated place, or null if they have not stated one.
 *
 * `district` is accepted and currently unused: districts have no coordinate
 * table, and inventing one per district would be a much larger claim than the
 * province centre already makes. It is in the signature so the call sites do not
 * change the day that data exists.
 */
export function regionCentre(
  region?: string | null,
  _district?: string | null,
): { latitude: number; longitude: number } | null {
  const canonical = normaliseRegion(region);
  return canonical ? (REGION_CENTRES[canonical] ?? null) : null;
}
