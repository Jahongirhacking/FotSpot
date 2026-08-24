import { validateUsername } from '../users/username.util';
import {
  ACADEMY_USERNAME_MAX,
  normaliseAcademyUsername,
  suggestAcademyUsername,
  validateAcademyUsername,
} from './academy-username.util';

/**
 * Academy handles.
 *
 * The assertion that matters most is the last block: player handles and academy
 * handles share the `@` sigil, so the two sets must not overlap. That is a
 * property of the two shapes rather than of a uniqueness check, which is why it
 * can be tested here at all.
 */

describe('normaliseAcademyUsername', () => {
  it('strips the sigil and lowercases, like the player handle does', () => {
    expect(normaliseAcademyUsername('@Bunyodkor_Academy')).toBe('bunyodkor_academy');
    expect(normaliseAcademyUsername('  @@bunyodkorfc_academy  ')).toBe('bunyodkorfc_academy');
  });
});

describe('validateAcademyUsername', () => {
  it('accepts the shape from the brief', () => {
    expect(validateAcademyUsername('@bunyodkorfc_academy')).toBeNull();
    expect(validateAcademyUsername('bunyodkorfc_academy')).toBeNull();
  });

  it('accepts digits and several inner underscores', () => {
    expect(validateAcademyUsername('fc_pakhtakor_1956_academy')).toBeNull();
  });

  /* Case and the sigil are input noise — the same handle either way. */
  it('judges the normalised form', () => {
    expect(validateAcademyUsername('@BUNYODKOR_ACADEMY')).toBeNull();
  });

  it('requires the academy suffix', () => {
    expect(validateAcademyUsername('bunyodkorfc')).toEqual({ reason: 'suffix' });
    expect(validateAcademyUsername('bunyodkor_club')).toEqual({ reason: 'suffix' });
  });

  /* The suffix without a name in front of it identifies nothing. */
  it.each(['academyacademy', 'academy_academy'])('rejects %s', (value) => {
    expect(validateAcademyUsername(value)).toEqual({ reason: 'suffix-only' });
  });

  /*
   * Shape before suffix: a hyphenated value fails both, and "use underscores" is
   * the answer that helps — "must end in academy" would send somebody to add a
   * suffix they already had.
   */
  it('reports the shape first for a hyphenated handle', () => {
    expect(validateAcademyUsername('bunyodkor-fc-academy')).toEqual({ reason: 'shape' });
  });

  it.each([
    ['a leading underscore', '_bunyodkor_academy'],
    ['a trailing underscore', 'bunyodkor_academy_'],
    ['a doubled underscore', 'bunyodkor__academy'],
    ['a space', 'bunyodkor academy'],
    ['a dot', 'bunyodkor.academy'],
    ['an at sign inside', 'bun@yodkor_academy'],
  ])('rejects %s', (_why, value) => {
    expect(validateAcademyUsername(value)?.reason).toBe('shape');
  });

  it('rejects one that is too long', () => {
    const long = `${'a'.repeat(ACADEMY_USERNAME_MAX)}_academy`;

    expect(validateAcademyUsername(long)).toEqual({ reason: 'too-long' });
  });

  it('accepts one exactly at the maximum', () => {
    const stem = 'a'.repeat(ACADEMY_USERNAME_MAX - 'academy'.length);

    expect(`${stem}academy`).toHaveLength(ACADEMY_USERNAME_MAX);
    expect(validateAcademyUsername(`${stem}academy`)).toBeNull();
  });

  it('rejects an empty handle rather than throwing', () => {
    expect(validateAcademyUsername('')?.reason).toBe('too-short');
    expect(validateAcademyUsername('@')?.reason).toBe('too-short');
  });
});

/* -------------------------------------------------------------------------- */
/* The two @ namespaces must not overlap                                      */
/* -------------------------------------------------------------------------- */

describe('academy and player handles cannot collide', () => {
  /**
   * Both live behind `@`, so `/players/@x` and `/academies/@x` are one word
   * apart in a link somebody is asked to trust. Player handles are hyphen-only
   * and academy handles are underscore-only, which makes the sets disjoint by
   * construction rather than by a cross-table check somebody has to remember.
   */
  it('rejects every valid academy handle as a player handle', () => {
    for (const handle of [
      'bunyodkorfc_academy',
      'fc_pakhtakor_1956_academy',
      'x_academy',
    ]) {
      expect(validateAcademyUsername(handle)).toBeNull();
      expect(validateUsername(handle)).not.toBeNull();
    }
  });

  it('rejects a generated player handle as an academy handle', () => {
    expect(validateUsername('amber-falcon-nutmeg-42')).toBeNull();
    expect(validateAcademyUsername('amber-falcon-nutmeg-42')).not.toBeNull();
  });
});

describe('suggestAcademyUsername', () => {
  it('builds a handle from the academy name', () => {
    expect(suggestAcademyUsername('Bunyodkor FC')).toBe('bunyodkor_fc_academy');
  });

  it('does not repeat a suffix the name already has', () => {
    expect(suggestAcademyUsername('Shurtan Academy')).toBe('shurtan_academy');
  });

  it('suggests what it produces — the suggestion must itself be valid', () => {
    for (const name of ['Bunyodkor FC', 'Shurtan Academy', 'FC Pakhtakor 1956', 'A']) {
      const suggested = suggestAcademyUsername(name);
      expect(validateAcademyUsername(suggested)).toBeNull();
    }
  });

  /*
   * A name in Cyrillic or Uzbek script leaves nothing the shape can carry.
   * Answering with an empty string is honest — the form then asks the manager to
   * type one, rather than offering `_academy` and pretending it is a suggestion.
   */
  it('gives nothing rather than a guess for a name it cannot transliterate', () => {
    expect(suggestAcademyUsername('Бунёдкор')).toBe('');
    expect(suggestAcademyUsername('—')).toBe('');
  });

  it('keeps a long name within the maximum', () => {
    const suggested = suggestAcademyUsername('A'.repeat(80));

    expect(suggested.length).toBeLessThanOrEqual(ACADEMY_USERNAME_MAX);
    expect(validateAcademyUsername(suggested)).toBeNull();
  });
});
