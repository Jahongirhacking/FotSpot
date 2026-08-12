import {
  academyVisibleWeight,
  contributionOf,
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
