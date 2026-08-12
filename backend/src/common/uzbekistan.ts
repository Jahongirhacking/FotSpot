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
