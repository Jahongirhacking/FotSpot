import { computeCardStars, STARS_MAX_SCORE } from './card-stars.util';

const clip = (
  category: string,
  rating: number | null,
  reportedBy: 'SELF' | 'COACH' = 'SELF',
  createdAt = '2026-01-01T00:00:00.000Z',
) => ({ category, rating, reportedBy, createdAt });

const ALL = ['PACE', 'DRIBBLING', 'PASSING', 'FINISHING', 'PHYSICAL', 'TECHNIQUE'];

describe('computeCardStars', () => {
  it('is zero with nothing to go on', () => {
    expect(computeCardStars([], [])).toBe(0);
    expect(computeCardStars()).toBe(0);
  });

  it('caps a perfect self-assessment at three stars', () => {
    // The gap that makes the row mean something: only a coach fills the last two.
    const clips = ALL.map((category) => clip(category, 100));
    expect(computeCardStars(clips, [])).toBe(3);
  });

  it('gives five stars for a full set of coach ratings', () => {
    const clips = ALL.map((category) => clip(category, 100, 'COACH'));
    expect(computeCardStars(clips, [])).toBe(5);
  });

  it("counts a coach's correction in full, not halved", () => {
    const own = computeCardStars([clip('PACE', 80, 'SELF')], []);
    const corrected = computeCardStars([clip('PACE', 80, 'COACH')], []);
    expect(corrected).toBeGreaterThan(own);
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
