import { searchOrderBy } from './search-order.util';

/**
 * An ordering bug does not throw. It returns the right rows in the wrong order,
 * and nothing catches it but somebody noticing — which is why the whole table is
 * pinned here rather than left to a reviewer's eye.
 */

describe('searchOrderBy — the default is what search always did', () => {
  it('orders by newest profile when nothing is asked for', () => {
    expect(searchOrderBy(undefined)).toEqual([{ createdAt: 'desc' }]);
  });

  it('ignores a direction with no sort to apply it to', () => {
    expect(searchOrderBy(undefined, 'asc')).toEqual([{ createdAt: 'desc' }]);
  });
});

describe('searchOrderBy — by name', () => {
  it('orders on both names so a shared first name still resolves', () => {
    expect(searchOrderBy('name', 'asc')).toEqual([
      { firstName: 'asc' },
      { lastName: 'asc' },
      { createdAt: 'desc' },
    ]);
  });

  it('reverses both halves together', () => {
    expect(searchOrderBy('name', 'desc')).toEqual([
      { firstName: 'desc' },
      { lastName: 'desc' },
      { createdAt: 'desc' },
    ]);
  });
});

describe('searchOrderBy — by age', () => {
  /*
   * The inversion this exists to protect. Age is stored as a birth date, and the
   * later the date the younger the player — so ordering the column directly would
   * put "age, ascending" in charge of listing the oldest first. That is the kind
   * of wrong that looks plausible enough to ship.
   */
  it('puts the youngest first when ascending', () => {
    expect(searchOrderBy('age', 'asc')).toEqual([{ birthDate: 'desc' }, { createdAt: 'desc' }]);
  });

  it('puts the oldest first when descending', () => {
    expect(searchOrderBy('age', 'desc')).toEqual([{ birthDate: 'asc' }, { createdAt: 'desc' }]);
  });
});

describe('searchOrderBy — by recommendations', () => {
  it('counts the relation rather than joining the weight table', () => {
    expect(searchOrderBy('recommendations', 'desc')).toEqual([
      { recommendations: { _count: 'desc' } },
      { createdAt: 'desc' },
    ]);
  });

  /*
   * The reason for the count. Ordering by `recommendationWeight.globalWeight`
   * LEFT JOINs a row that only exists once somebody has been recommended, and
   * Postgres sorts NULL as larger than any value — so "most recommended" would
   * open with every player nobody has recommended. A count is zero, not null.
   */
  it('never orders through the nullable weight relation', () => {
    const clause = JSON.stringify(searchOrderBy('recommendations', 'desc'));
    expect(clause).not.toContain('recommendationWeight');
    expect(clause).not.toContain('globalWeight');
  });

  it('reverses to fewest first', () => {
    expect(searchOrderBy('recommendations', 'asc')).toEqual([
      { recommendations: { _count: 'asc' } },
      { createdAt: 'desc' },
    ]);
  });
});

describe('searchOrderBy — every ordering is total', () => {
  /*
   * Without a final tiebreak, Postgres may return equal rows in any order and
   * does not promise the same one twice. That is how a sort that looks right on
   * page 1 duplicates a row on page 2 and drops another entirely.
   */
  it.each(['name', 'age', 'recommendations'] as const)('ends %s with a stable tiebreak', (sort) => {
    const clause = searchOrderBy(sort, 'asc');
    expect(clause[clause.length - 1]).toEqual({ createdAt: 'desc' });
  });

  it('defaults to ascending when only a sort is given', () => {
    expect(searchOrderBy('name')).toEqual(searchOrderBy('name', 'asc'));
  });
});
