import { computeCardStars, roundToNearestHalf, STARS_MAX_SCORE } from './card-stars.util';

const clip = (
  category: string,
  rating: number | null,
  reportedBy: 'SELF' | 'COACH' | 'ADMIN' = 'SELF',
  createdAt = '2026-01-01T00:00:00.000Z',
) => ({ category, rating, reportedBy, createdAt });

const ALL = ['PACE', 'DRIBBLING', 'PASSING', 'FINISHING', 'PHYSICAL', 'TECHNIQUE'];

describe('computeCardStars', () => {
  it('is zero with nothing to go on', () => {
    expect(computeCardStars([], [])).toBe(0);
    expect(computeCardStars()).toBe(0);
  });

  it('caps a perfect self-assessment at two and a half stars', () => {
    // The gap that makes the row mean something: only a coach fills the rest.
    // Six self-rated 100s are 300 of 600 — exactly half the row.
    const clips = ALL.map((category) => clip(category, 100));
    expect(computeCardStars(clips, [])).toBe(2.5);
  });

  it('gives five stars for a full set of coach ratings', () => {
    const clips = ALL.map((category) => clip(category, 100, 'COACH'));
    expect(computeCardStars(clips, [])).toBe(5);
  });

  it("counts a coach's correction in full, not halved", () => {
    // 100/2 = 50 → 0.42 → half a star; 100 → 0.83 → one star.
    const own = computeCardStars([clip('PACE', 100, 'SELF')], []);
    const corrected = computeCardStars([clip('PACE', 100, 'COACH')], []);
    expect(own).toBe(0.5);
    expect(corrected).toBe(1);
  });

  it('uses the newest rating for an attribute, not the first or the best', () => {
    const clips = [
      clip('PACE', 100, 'SELF', '2026-01-01T00:00:00.000Z'),
      clip('PACE', 20, 'SELF', '2026-06-01T00:00:00.000Z'),
    ];
    // 20/2 = 10 → still zero stars; the 100 must not be what counts.
    expect(computeCardStars(clips, [])).toBe(0);
  });

  it('ignores clips with no rating, and categories it does not track', () => {
    expect(computeCardStars([clip('PACE', null), clip('MATCH_HIGHLIGHTS', 99)], [])).toBe(0);
  });

  it('takes a formal assessment when the clip is the player’s own claim', () => {
    const clips = [clip('PACE', 40, 'SELF')];
    const assessed = [{ createdAt: '2026-05-01T00:00:00.000Z', speed: 100 }];
    // 40/2 + 100 = 120 → 1 star, where the claim alone would be 0.
    expect(computeCardStars(clips, assessed)).toBe(1);
    expect(computeCardStars(clips, [])).toBe(0);
  });

  it('lets a coach-rated clip stand instead of double-counting the assessment', () => {
    const clips = [clip('PACE', 100, 'COACH')];
    const assessed = [{ createdAt: '2026-05-01T00:00:00.000Z', speed: 100 }];
    expect(computeCardStars(clips, assessed)).toBe(computeCardStars(clips, []));
  });

  it('reads the newest assessment, not an average of every one ever filed', () => {
    const assessed = [
      { createdAt: '2026-01-01T00:00:00.000Z', speed: 0 },
      { createdAt: '2026-06-01T00:00:00.000Z', speed: 100 },
    ];
    const older = [{ createdAt: '2026-01-01T00:00:00.000Z', speed: 0 }];
    expect(computeCardStars([], assessed)).toBeGreaterThan(computeCardStars([], older));
  });

  it('never exceeds five, even when both halves are full', () => {
    const clips = [
      ...ALL.map((category) => clip(category, 100, 'SELF')),
      ...ALL.map((category) => clip(category, 100, 'COACH', '2026-09-01T00:00:00.000Z')),
    ];
    expect(computeCardStars(clips, [])).toBe(5);
  });

  it('scores the documented maximum on coach ratings alone', () => {
    const clips = ALL.map((category) => clip(category, STARS_MAX_SCORE / 6, 'COACH'));
    expect(computeCardStars(clips, [])).toBe(5);
  });
});

/**
 * The row is drawn in halves, so the number is one of 0, 0.5, …, 5 — the
 * scaled score rounded to the nearest half, halves rounding up, and clamped.
 */
describe('roundToNearestHalf', () => {
  it.each([
    [1.25, 1.5],
    [1.2, 1],
    [0.2, 0],
    [0.3, 0.5],
    [0.6, 0.5],
    [4.4, 4.5],
    [4.75, 5],
    [0, 0],
    [5, 5],
  ])('%s → %s', (value, expected) => {
    expect(roundToNearestHalf(value)).toBe(expected);
  });
});

describe('computeCardStars — half stars', () => {
  it('reads half a star from a single self-rated clip', () => {
    // 100/2 = 50 → 50/600 × 5 = 0.42 → 0.5
    expect(computeCardStars([clip('PACE', 100)], [])).toBe(0.5);
  });

  it('says "two and a half" rather than rounding a whole star away', () => {
    // Three coach-rated attributes at 100 → 300/600 × 5 = 2.5
    const clips = ['PACE', 'DRIBBLING', 'PASSING'].map((c) => clip(c, 100, 'COACH'));
    expect(computeCardStars(clips, [])).toBe(2.5);
  });

  it('only ever answers a multiple of a half, within 0–5', () => {
    for (const rating of [3, 17, 33, 51, 66, 81, 99, 100]) {
      const clips = ALL.map((c) => clip(c, rating, 'COACH'));
      const stars = computeCardStars(clips, []);
      expect(stars * 2).toBe(Math.round(stars * 2));
      expect(stars).toBeGreaterThanOrEqual(0);
      expect(stars).toBeLessThanOrEqual(5);
    }
  });
});

describe('a moderator’s rating', () => {
  it('weighs like a coach’s, not like the player’s own claim', () => {
    const byAdmin = computeCardStars(
      ALL.map((category) => clip(category, 100, 'ADMIN')),
      [],
    );
    const byCoach = computeCardStars(
      ALL.map((category) => clip(category, 100, 'COACH')),
      [],
    );
    const bySelf = computeCardStars(
      ALL.map((category) => clip(category, 100, 'SELF')),
      [],
    );
    expect(byAdmin).toBe(byCoach);
    expect(byAdmin).toBeGreaterThan(bySelf);
  });

  it('an unrated clip counts for nothing', () => {
    expect(
      computeCardStars(
        ALL.map((category) => clip(category, null)),
        [],
      ),
    ).toBe(0);
  });
});
