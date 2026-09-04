import type { DominantFoot } from '@prisma/client';
import { dominantFootWhere } from './dominant-foot.util';

/**
 * Which players a dominant-foot filter admits.
 *
 * Read the way a scout reads the filter: "left-footers" means everyone who can
 * play off the left, and a two-footed player can. The `where` fragment is
 * evaluated against each foot the way Postgres would, so these are the seven
 * cases the rule is made of and not the shape of an object.
 */

const FEET: DominantFoot[] = ['LEFT', 'RIGHT', 'BOTH'];

/** The database's reading of the fragment: equality, or membership. */
function admits(filter: DominantFoot, foot: DominantFoot): boolean {
  const where = dominantFootWhere(filter);
  if (typeof where === 'string') return foot === where;
  const set = (where as { in: DominantFoot[] }).in;
  return set.includes(foot);
}

const admitted = (filter: DominantFoot) => FEET.filter((foot) => admits(filter, foot));

describe('dominantFootWhere — BOTH is not a third foot', () => {
  it('LEFT returns left-footed players', () => {
    expect(admits('LEFT', 'LEFT')).toBe(true);
  });

  it('LEFT returns two-footed players', () => {
    expect(admits('LEFT', 'BOTH')).toBe(true);
  });

  it('LEFT does not return right-footed players', () => {
    expect(admits('LEFT', 'RIGHT')).toBe(false);
  });

  it('RIGHT returns right-footed players', () => {
    expect(admits('RIGHT', 'RIGHT')).toBe(true);
  });

  it('RIGHT returns two-footed players', () => {
    expect(admits('RIGHT', 'BOTH')).toBe(true);
  });

  it('RIGHT does not return left-footed players', () => {
    expect(admits('RIGHT', 'LEFT')).toBe(false);
  });

  it('BOTH returns two-footed players only', () => {
    expect(admitted('BOTH')).toEqual(['BOTH']);
  });

  /* The whole table at once, so a change to one row is seen against the rest. */
  it('admits exactly the documented set for each filter', () => {
    expect(admitted('LEFT')).toEqual(['LEFT', 'BOTH']);
    expect(admitted('RIGHT')).toEqual(['RIGHT', 'BOTH']);
    expect(admitted('BOTH')).toEqual(['BOTH']);
  });

  /* The shape Prisma turns into `IN (...)` — one query, not a post-filter. */
  it('is a membership clause for a single foot and an equality for BOTH', () => {
    expect(dominantFootWhere('LEFT')).toEqual({ in: ['LEFT', 'BOTH'] });
    expect(dominantFootWhere('RIGHT')).toEqual({ in: ['RIGHT', 'BOTH'] });
    expect(dominantFootWhere('BOTH')).toBe('BOTH');
  });
});
