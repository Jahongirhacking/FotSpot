import {
  academyVisibleWeight,
  contributionOf,
  decayedWeight,
  DEFAULT_HALF_LIFE_DAYS,
  SPECIFIC_ACADEMY_MULTIPLIER,
} from './recommendation-weight.util';
import { SCOUT_LEVEL_TIERS } from './scout-level.util';

describe('contributionOf (README 1.5.3)', () => {
  it('adds a global recommendation to the global weight only', () => {
    expect(contributionOf('GLOBAL', 5)).toEqual({ global: 5, perAcademy: 0 });
  });

  it('adds a specific recommendation to BOTH the global weight and the academy extra', () => {
    // The worked example from the spec: scout weight 5, specific to one academy.
    // globalWeight becomes 5 *and* that academy sees an extra 5.
    expect(contributionOf('SPECIFIC', 5)).toEqual({ global: 5, perAcademy: 5 });
  });

  it('never contributes negative weight', () => {
    expect(contributionOf('SPECIFIC', -10)).toEqual({ global: 0, perAcademy: 0 });
  });

  it('scales with the scout tier, so a Legendary Scout dwarfs an Observer', () => {
    const observer = contributionOf('SPECIFIC', 1);
    const legendary = contributionOf('SPECIFIC', 125);
    expect(legendary.global).toBe(125 * observer.global);
  });
});

describe('the specific-recommendation bonus cannot outrank a better scout', () => {
  // Same invariant that capped the retired follow-based trust multiplier: every
  // step of the §1.5 ladder is >= 2.5x, so a doubled lesser scout stays below the
  // next tier's plain contribution.
  const weights = [...SCOUT_LEVEL_TIERS].reverse().map((tier) => tier.weight);

  it.each(weights.slice(0, -1).map((w, i) => [w, weights[i + 1]]))(
    'a specific recommendation at weight %i stays below a global one at %i',
    (lower, higher) => {
      const targeted = contributionOf('SPECIFIC', lower);
      const plain = contributionOf('GLOBAL', higher);
      expect(academyVisibleWeight(targeted.global, targeted.perAcademy)).toBeLessThan(
        plain.global * 2,
      );
      expect(1 + SPECIFIC_ACADEMY_MULTIPLIER).toBeLessThan(higher / lower);
    },
  );
});

describe('academyVisibleWeight', () => {
  it('is the public weight plus that academy’s private extra', () => {
    expect(academyVisibleWeight(20, 5)).toBe(25);
  });

  it('equals the global weight when nothing was addressed to this academy', () => {
    expect(academyVisibleWeight(20, 0)).toBe(20);
  });
});

describe('decayedWeight (the future recalculation job)', () => {
  it('leaves a fresh weight untouched', () => {
    expect(decayedWeight(100, 0)).toBe(100);
  });

  it('halves it after one half-life', () => {
    expect(decayedWeight(100, DEFAULT_HALF_LIFE_DAYS)).toBe(50);
  });

  it('quarters it after two', () => {
    expect(decayedWeight(100, DEFAULT_HALF_LIFE_DAYS * 2)).toBe(25);
  });

  it('is continuous, so running the job daily or weekly gives the same curve', () => {
    // Seven daily passes must land where one seven-day pass lands.
    let daily = 100;
    for (let day = 0; day < 7; day++) daily = decayedWeight(daily, 1);
    const weekly = decayedWeight(100, 7);
    expect(Math.abs(daily - weekly)).toBeLessThan(0.05);
  });

  it('never goes negative', () => {
    expect(decayedWeight(1, DEFAULT_HALF_LIFE_DAYS * 50)).toBeGreaterThanOrEqual(0);
  });

  it('lets a recent modest recommendation overtake a large stale one', () => {
    // The whole point of decay: discovery must keep pointing at new talent.
    const stale = decayedWeight(125, DEFAULT_HALF_LIFE_DAYS * 4);
    const fresh = decayedWeight(20, 7);
    expect(fresh).toBeGreaterThan(stale);
  });
});
