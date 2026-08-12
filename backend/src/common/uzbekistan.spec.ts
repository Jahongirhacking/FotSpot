import {
  UZBEKISTAN,
  UZBEK_REGIONS,
  districtsOf,
  isValidRegionDistrict,
  normaliseDistrict,
  normaliseRegion,
} from './uzbekistan';

/**
 * The pair check exists because `region` and `district` were validated
 * separately, so "Namangan viloyati / Xiva" stored happily: a real district in a
 * province that does not contain it. Search filters on region, so a player filed
 * that way is findable under a province they are not in and invisible under the
 * one they are.
 */
describe('isValidRegionDistrict', () => {
  it('accepts a district that really is in the province', () => {
    expect(isValidRegionDistrict('Toshkent shahri', 'Bektemir')).toBe(true);
    expect(isValidRegionDistrict('Xorazm viloyati', 'Xiva')).toBe(true);
  });

  it('rejects a real district filed under the wrong province', () => {
    // The exact case from the brief: Xiva is in Xorazm, not Namangan.
    expect(isValidRegionDistrict('Namangan viloyati', 'Xiva')).toBe(false);
    expect(isValidRegionDistrict('Toshkent shahri', 'Urgut')).toBe(false);
  });

  it('rejects a province that does not exist', () => {
    expect(isValidRegionDistrict('Atlantis', 'Bektemir')).toBe(false);
  });

  it('rejects a district with no province to check it against', () => {
    // An unchecked district is exactly what this exists to stop.
    expect(isValidRegionDistrict(undefined, 'Bektemir')).toBe(false);
    expect(isValidRegionDistrict('', 'Bektemir')).toBe(false);
  });

  it('allows a province on its own, and allows neither', () => {
    // Both fields are optional — a player who has not said where they are is not
    // an error, and a province without a district is a complete answer.
    expect(isValidRegionDistrict('Andijon viloyati', undefined)).toBe(true);
    expect(isValidRegionDistrict(undefined, undefined)).toBe(true);
    expect(isValidRegionDistrict('', '')).toBe(true);
  });
});

describe('spelling', () => {
  it('folds an ASCII apostrophe onto the Uzbek one', () => {
    // Two spellings of one district would compare unequal and split the same
    // place in search, so anything arriving by curl or import is folded.
    expect(normaliseDistrict('Qoraqalpog‘iston Respublikasi', "Qorao'zak")).toBe('Qorao‘zak');
    expect(normaliseRegion("Farg'ona viloyati")).toBe('Farg‘ona viloyati');
    expect(isValidRegionDistrict("Farg'ona viloyati", "So'x")).toBe(true);
  });

  it('accepts the long form with its suffix', () => {
    // Somebody pasting from an official list sends "Bektemir tumani".
    expect(normaliseDistrict('Toshkent shahri', 'Bektemir tumani')).toBe('Bektemir');
    expect(normaliseRegion('Andijon')).toBe('Andijon viloyati');
  });

  it('is case-insensitive', () => {
    expect(normaliseDistrict('Toshkent shahri', 'CHILONZOR')).toBe('Chilonzor');
  });

  it('answers null for something that is not a district of that province', () => {
    expect(normaliseDistrict('Namangan viloyati', 'Xiva')).toBeNull();
    expect(normaliseRegion('Atlantis')).toBeNull();
  });
});

describe('the dataset itself', () => {
  it('carries all fourteen provinces', () => {
    expect(UZBEK_REGIONS).toHaveLength(14);
    expect(UZBEK_REGIONS).toContain('Toshkent shahri');
    expect(UZBEK_REGIONS).toContain('Qoraqalpog‘iston Respublikasi');
  });

  it('has no district carrying the "tumani" suffix', () => {
    // The word means "district" — every entry would have it, so it identifies
    // nothing, and stripping it at render time in each screen is the cost.
    const withSuffix = Object.values(UZBEKISTAN)
      .flat()
      .filter((district) => /\stumani$/i.test(district));
    expect(withSuffix).toEqual([]);
  });

  it('has no duplicate district inside one province', () => {
    for (const region of UZBEK_REGIONS) {
      const districts = districtsOf(region);
      expect(new Set(districts).size).toBe(districts.length);
    }
  });

  it('gives every province at least one district', () => {
    for (const region of UZBEK_REGIONS) {
      expect(districtsOf(region).length).toBeGreaterThan(0);
    }
  });

  it('answers an empty list for an unknown province rather than throwing', () => {
    expect(districtsOf('Atlantis')).toEqual([]);
    expect(districtsOf(null)).toEqual([]);
  });
});
