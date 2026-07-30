import {
  computeRecommendationCredibility,
  computeScoutLevel,
  computeSuccessRate,
  SCOUT_LEVEL_TIERS,
} from './scout-level.util';

describe('computeSuccessRate (README 1.5)', () => {
  it('returns 0 for a scout with no recommendations rather than dividing by zero', () => {
    expect(computeSuccessRate(0, 0)).toBe(0);
  });

  it('applies accepted / total * 100', () => {
    expect(computeSuccessRate(200, 100)).toBe(50);
    expect(computeSuccessRate(3, 1)).toBeCloseTo(33.333, 3);
  });
});

describe('computeScoutLevel tier boundaries', () => {
  it('falls back to Observer when nothing else matches', () => {
    expect(computeScoutLevel(0, 0)).toMatchObject({ level: 1, name: 'Observer', weight: 1 });
  });

  it.each([
    [5, 10, 2, 'Spotter'],
    [20, 20, 3, 'Talent Hunter'],
    [50, 30, 4, 'Elite Scout'],
    [100, 40, 5, 'Master Scout'],
    [250, 50, 6, 'Legendary Scout'],
  ])('promotes at exactly (%i recs, %i%%) -> level %i', (total, rate, level, name) => {
    expect(computeScoutLevel(total, rate)).toMatchObject({ level, name });
  });

  it('holds a scout one recommendation short of the next tier', () => {
    expect(computeScoutLevel(249, 50).level).toBe(5);
  });

  it('holds a scout whose success rate is one point short', () => {
    expect(computeScoutLevel(250, 49).level).toBe(5);
  });

  it('returns the highest tier a scout qualifies for, not the first listed', () => {
    // 300 recommendations at 55% clears every tier; order matters in the .find().
    expect(computeScoutLevel(300, 55).level).toBe(6);
  });
});

describe('weight ladder (README 1.5 fairness property)', () => {
  it('is geometric with every step >= 2.5x', () => {
    // Ascending: Observer -> Legendary.
    const weights = [...SCOUT_LEVEL_TIERS].reverse().map((t) => t.weight);
    expect(weights).toEqual([1, 3, 8, 20, 50, 125]);

    for (let i = 1; i < weights.length; i++) {
      expect(weights[i] / weights[i - 1]).toBeGreaterThanOrEqual(2.5);
    }
  });

  it("matches each tier's minimum proven placements", () => {
    // weight ~= minRecommendations * minSuccessRate: the players a scout must
    // actually have placed to reach the tier.
    const legendary = SCOUT_LEVEL_TIERS.find((t) => t.level === 6)!;
    const proven = (legendary.minRecommendations * legendary.minSuccessRate) / 100;
    expect(legendary.weight).toBe(proven);
  });
});

describe('computeRecommendationCredibility (README 1.5.1)', () => {
  it('returns 0 for no backing at all', () => {
    expect(computeRecommendationCredibility([])).toBe(0);
  });

  it('leaves a single recommendation at full weight', () => {
    expect(computeRecommendationCredibility([125])).toBe(125);
  });

  it('discounts the k-th highest weight by k', () => {
    expect(computeRecommendationCredibility([125, 20])).toBe(135);
  });

  it('is order-independent - it sorts before discounting', () => {
    expect(computeRecommendationCredibility([1, 125, 20])).toBeCloseTo(
      computeRecommendationCredibility([125, 20, 1]),
      10,
    );
  });

  it('makes fabricated volume nearly worthless', () => {
    expect(computeRecommendationCredibility(Array(6).fill(1))).toBeCloseTo(2.45, 2);
    expect(computeRecommendationCredibility(Array(125).fill(1))).toBeCloseTo(5.41, 2);
  });

  it('keeps one Legendary Scout ahead of any number of Observers', () => {
    const sybil = computeRecommendationCredibility(Array(10_000).fill(1));
    expect(sybil).toBeLessThan(computeRecommendationCredibility([125]));
  });

  it('still rewards genuine corroboration', () => {
    const alone = computeRecommendationCredibility([50]);
    const corroborated = computeRecommendationCredibility([50, 20]);
    expect(corroborated).toBeGreaterThan(alone);
  });
});
