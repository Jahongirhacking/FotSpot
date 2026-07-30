import { SCOUT_LEVEL_TIERS } from './scout-level.util';
import {
  computeAcademyWeight,
  computeTrustMultiplier,
  MAX_TRUST_MULTIPLIER,
  TRUSTED_ACCEPTED_THRESHOLD,
  TrustMultiplier,
} from './scout-trust.util';

describe('computeTrustMultiplier (README 1.5.2)', () => {
  it('defaults to 1.0 when the academy has no relationship with the scout', () => {
    expect(computeTrustMultiplier('NONE', 0)).toBe(TrustMultiplier.NONE);
  });

  it('suppresses a muted scout', () => {
    expect(computeTrustMultiplier('MUTED', 99)).toBe(TrustMultiplier.MUTED);
  });

  it('gives a followed scout 1.5x until the trusted threshold', () => {
    expect(computeTrustMultiplier('FOLLOWING', 0)).toBe(TrustMultiplier.FOLLOWED);
    expect(computeTrustMultiplier('FOLLOWING', TRUSTED_ACCEPTED_THRESHOLD - 1)).toBe(
      TrustMultiplier.FOLLOWED,
    );
  });

  it('promotes to trusted at the threshold', () => {
    expect(computeTrustMultiplier('FOLLOWING', TRUSTED_ACCEPTED_THRESHOLD)).toBe(
      TrustMultiplier.TRUSTED,
    );
  });

  it('ignores acceptance history for a muted scout', () => {
    expect(computeTrustMultiplier('MUTED', TRUSTED_ACCEPTED_THRESHOLD + 10)).toBe(
      TrustMultiplier.MUTED,
    );
  });
});

describe('trust cannot promote a scout a full tier (the 1.5.2 invariant)', () => {
  // Ascending Observer -> Legendary.
  const weights = [...SCOUT_LEVEL_TIERS].reverse().map((t) => t.weight);

  it.each(weights.slice(0, -1).map((w, i) => [w, weights[i + 1]]))(
    'a fully trusted scout at weight %i stays below the next tier base %i',
    (base, nextTierBase) => {
      expect(computeAcademyWeight(base, 'FOLLOWING', TRUSTED_ACCEPTED_THRESHOLD)).toBeLessThan(
        nextTierBase,
      );
    },
  );

  it('holds because the ceiling is below the smallest ladder step', () => {
    const smallestStep = Math.min(...weights.slice(1).map((w, i) => w / weights[i]));
    expect(MAX_TRUST_MULTIPLIER).toBeLessThan(smallestStep);
  });

  it('cannot turn a followed Observer into a threat to a Legendary Scout', () => {
    expect(computeAcademyWeight(1, 'FOLLOWING', 99)).toBe(2);
    expect(computeAcademyWeight(1, 'FOLLOWING', 99)).toBeLessThan(125);
  });
});

describe('computeAcademyWeight', () => {
  it('leaves an untrusted scout at their global weight', () => {
    expect(computeAcademyWeight(20, 'NONE', 0)).toBe(20);
  });

  it('suppresses without erasing a proven scout', () => {
    // A muted Legendary is demoted but still visible - an academy should not be
    // able to blind itself to 125 real placements (README 1.5.2).
    expect(computeAcademyWeight(125, 'MUTED', 0)).toBe(31.25);
  });

  it('drops a muted Observer effectively out of sight', () => {
    expect(computeAcademyWeight(1, 'MUTED', 0)).toBe(0.25);
  });
});
