import {
  MAX_KEYWORD_LENGTH,
  MAX_KEYWORDS,
  normaliseKeywords,
} from './seo-keywords.util';

/**
 * The rules that stop a keyword list becoming keyword stuffing.
 *
 * The form enforces most of these too, as a courtesy to whoever is typing. These
 * assert them where they are actually a rule — a list that arrived without going
 * through the form.
 */

describe('normaliseKeywords', () => {
  it('keeps a clean list in the order it was given', () => {
    expect(normaliseKeywords(['tashkent football academy', 'youth football'])).toEqual([
      'tashkent football academy',
      'youth football',
    ]);
  });

  it('trims, and collapses inner whitespace', () => {
    expect(normaliseKeywords(['  tashkent  football   academy '])).toEqual([
      'tashkent football academy',
    ]);
  });

  it.each([[''], ['   '], ['\t\n']])('drops %j rather than storing an empty keyword', (value) => {
    expect(normaliseKeywords([value])).toEqual([]);
  });

  /*
   * Compared case-insensitively but stored as typed: an operator who wrote
   * "Tashkent Football Academy" meant those capitals, and lower-casing to make
   * the comparison easy would silently rewrite their copy.
   */
  it('removes case-insensitive duplicates, keeping the first spelling', () => {
    expect(
      normaliseKeywords(['Tashkent Academy', 'tashkent academy', 'TASHKENT ACADEMY']),
    ).toEqual(['Tashkent Academy']);
  });

  it('treats a whitespace-only difference as a duplicate', () => {
    expect(normaliseKeywords(['youth football', ' youth  football '])).toEqual(['youth football']);
  });

  it('caps the number of keywords', () => {
    const many = Array.from({ length: MAX_KEYWORDS + 15 }, (_, index) => `keyword ${index}`);

    expect(normaliseKeywords(many)).toHaveLength(MAX_KEYWORDS);
    // The cap keeps the front of the list — the operator's own ordering is their
    // judgement about which terms matter most.
    expect(normaliseKeywords(many)[0]).toBe('keyword 0');
  });

  it('drops a keyword longer than the limit rather than truncating it', () => {
    const long = 'a'.repeat(MAX_KEYWORD_LENGTH + 1);

    expect(normaliseKeywords(['fine', long])).toEqual(['fine']);
  });

  it('accepts one exactly at the limit', () => {
    const exact = 'a'.repeat(MAX_KEYWORD_LENGTH);

    expect(normaliseKeywords([exact])).toEqual([exact]);
  });

  it('answers with an empty list for nothing at all', () => {
    expect(normaliseKeywords(undefined)).toEqual([]);
    expect(normaliseKeywords(null)).toEqual([]);
    expect(normaliseKeywords([])).toEqual([]);
  });

  /* The DTO validates types, but this is reachable from anywhere in the server
     and a non-string would otherwise reach `.trim()`. */
  it('ignores a value that is not a string', () => {
    expect(normaliseKeywords([42, null, 'real'] as unknown as string[])).toEqual(['real']);
  });

  /*
   * Keywords are operator-supplied text that ends up in metadata. Nothing is
   * stripped here — escaping belongs to whatever renders it, and Next's
   * metadata API escapes on output — but the value must survive unchanged so
   * that the escaping has the real thing to work with rather than a half-cleaned
   * version that looks safe and is not.
   */
  it('stores markup verbatim rather than half-cleaning it', () => {
    expect(normaliseKeywords(['<script>alert(1)</script>'])).toEqual([
      '<script>alert(1)</script>',
    ]);
  });
});
