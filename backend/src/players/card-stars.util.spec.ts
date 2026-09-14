import {
  computeCardStars,
  currentClip,
  displayStars,
  roundToNearestHalf,
  STARS_MAX_SCORE,
} from './card-stars.util';

const clip = (
  category: string,
  rating: number | null,
  reportedBy: 'VERIFIED' | 'RELATIVE' = 'RELATIVE',
  recordedAt = '2026-01-01T00:00:00.000Z',
  createdAt = recordedAt,
) => ({ category, rating, reportedBy, recordedAt, createdAt });

const ALL = ['PACE', 'DRIBBLING', 'PASSING', 'FINISHING', 'PHYSICAL', 'TECHNIQUE'];

describe('computeCardStars', () => {
  it('is zero with nothing to go on', () => {
    expect(computeCardStars([], [])).toBe(0);
    expect(computeCardStars()).toBe(0);
  });

  it('caps a card of relative ratings at two and a half stars', () => {
    // The gap that makes the row mean something: only a coach fills the rest.
    // Six relative 100s are 300 of 600 — exactly half the row.
    const clips = ALL.map((category) => clip(category, 100));
    expect(computeCardStars(clips, [])).toBe(2.5);
  });

  it('gives five stars for a full set of coach ratings', () => {
    const clips = ALL.map((category) => clip(category, 100, 'VERIFIED'));
    expect(computeCardStars(clips, [])).toBe(5);
  });

  it("counts a coach's rating in full and a moderator's relative one halved", () => {
    // 100/2 = 50 → 50/600 × 5 = 0.4167; 100 → 0.8333. Precise, not rounded:
    // a scout sorting by stars must see the coach-rated card ahead.
    const relative = computeCardStars([clip('PACE', 100, 'RELATIVE')], []);
    const verified = computeCardStars([clip('PACE', 100, 'VERIFIED')], []);
    expect(relative).toBeCloseTo(50 / 120, 6);
    expect(verified).toBeCloseTo(100 / 120, 6);
    expect(verified).toBeCloseTo(relative * 2, 6);
  });

  it('uses the newest rating for an attribute, not the first or the best', () => {
    const clips = [
      clip('PACE', 100, 'RELATIVE', '2026-01-01T00:00:00.000Z'),
      clip('PACE', 20, 'RELATIVE', '2026-06-01T00:00:00.000Z'),
    ];
    // 20/2 = 10 → 10/600 × 5; the 100 must not be what counts.
    expect(computeCardStars(clips, [])).toBeCloseTo(10 / 120, 6);
  });

  it('ignores clips with no rating, and categories it does not track', () => {
    expect(computeCardStars([clip('PACE', null), clip('MATCH_HIGHLIGHTS', 99)], [])).toBe(0);
  });

  it('takes a formal assessment when the clip’s number is only relative', () => {
    const clips = [clip('PACE', 40, 'RELATIVE')];
    const assessed = [{ createdAt: '2026-05-01T00:00:00.000Z', speed: 100 }];
    // 40/2 + 100 = 120 → exactly one star, where the relative number alone is
    // 20/600 × 5 — a sixth of a star, drawn as none.
    expect(computeCardStars(clips, assessed)).toBeCloseTo(1, 10);
    expect(computeCardStars(clips, [])).toBeCloseTo(20 / 120, 6);
    expect(displayStars(computeCardStars(clips, []))).toBe(0);
  });

  it('lets a coach-rated clip stand instead of double-counting the assessment', () => {
    const clips = [clip('PACE', 100, 'VERIFIED')];
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
      ...ALL.map((category) => clip(category, 100, 'RELATIVE')),
      ...ALL.map((category) => clip(category, 100, 'VERIFIED', '2026-09-01T00:00:00.000Z')),
    ];
    expect(computeCardStars(clips, [])).toBe(5);
  });

  it('scores the documented maximum on coach ratings alone', () => {
    const clips = ALL.map((category) => clip(category, STARS_MAX_SCORE / 6, 'VERIFIED'));
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

describe('the precise value, and the half stars a card draws', () => {
  it('is precise in services: two players a tenth of a star apart are not tied', () => {
    const a = computeCardStars(
      [clip('PACE', 100, 'VERIFIED'), clip('DRIBBLING', 12, 'VERIFIED')],
      [],
    );
    const b = computeCardStars([clip('PACE', 100, 'VERIFIED')], []);
    expect(a).toBeGreaterThan(b);
    expect(displayStars(a)).toBe(displayStars(b));
  });

  it('draws half a star for a single relative rating', () => {
    // 100/2 = 50 → 50/600 × 5 = 0.42 → drawn as 0.5
    expect(displayStars(computeCardStars([clip('PACE', 100)], []))).toBe(0.5);
  });

  it('draws "two and a half" rather than rounding a whole star away', () => {
    // Three coach-rated attributes at 100 → 300/600 × 5 = 2.5
    const clips = ['PACE', 'DRIBBLING', 'PASSING'].map((c) => clip(c, 100, 'VERIFIED'));
    expect(displayStars(computeCardStars(clips, []))).toBe(2.5);
  });

  it('the drawn value is always a multiple of a half, within 0–5', () => {
    for (const rating of [3, 17, 33, 51, 66, 81, 99, 100]) {
      const clips = ALL.map((c) => clip(c, rating, 'VERIFIED'));
      const stars = displayStars(computeCardStars(clips, []));
      expect(stars * 2).toBe(Math.round(stars * 2));
      expect(stars).toBeGreaterThanOrEqual(0);
      expect(stars).toBeLessThanOrEqual(5);
    }
  });

  it('a threshold compares the precise value, so a 0.3 does not pass as half a star', () => {
    // 36/600 × 5 = 0.3: drawn as half a star, but under a 0.5 bar.
    const stars = computeCardStars([clip('PACE', 36, 'VERIFIED')], []);
    expect(displayStars(stars)).toBe(0.5);
    expect(stars >= 0.5).toBe(false);
  });
});

describe('which clip stands for an attribute', () => {
  const at = (day: string) => `2026-${day}T00:00:00.000Z`;

  it('prefers the newest verified clip by the day it was filmed, else the newest of any kind', () => {
    // The brief's example, newest filmed first.
    const clips = [
      clip('DRIBBLING', 40, 'RELATIVE', at('05-05')),
      clip('PACE', 70, 'VERIFIED', at('05-04')),
      clip('DRIBBLING', 30, 'VERIFIED', at('05-03')),
      clip('FINISHING', 60, 'RELATIVE', at('05-02')),
      clip('PACE', 80, 'VERIFIED', at('05-01')),
    ];
    expect(currentClip(clips, 'DRIBBLING')).toMatchObject({ rating: 30, reportedBy: 'VERIFIED' });
    expect(currentClip(clips, 'FINISHING')).toMatchObject({ rating: 60, reportedBy: 'RELATIVE' });
    expect(currentClip(clips, 'PACE')).toMatchObject({ rating: 70, reportedBy: 'VERIFIED' });
    expect(currentClip(clips, 'PASSING')).toBeNull();
  });

  it('reads "newest" from the day filmed, not the upload', () => {
    const clips = [
      clip('PACE', 90, 'VERIFIED', at('01-01'), at('09-01')), // filmed in January, uploaded late
      clip('PACE', 50, 'VERIFIED', at('06-01'), at('06-01')),
    ];
    expect(currentClip(clips, 'PACE')?.rating).toBe(50);
  });

  it('breaks a same-day tie by the upload', () => {
    const clips = [
      clip('PACE', 10, 'RELATIVE', at('06-01'), at('06-01T10:00:00.000Z'.slice(0, 5))),
      clip('PACE', 20, 'RELATIVE', at('06-01'), '2026-06-01T12:00:00.000Z'),
    ];
    expect(currentClip(clips, 'PACE')?.rating).toBe(20);
  });

  it('skips unrated clips even when they are the newest', () => {
    const clips = [
      clip('PACE', null, 'RELATIVE', at('09-01')),
      clip('PACE', 55, 'VERIFIED', at('01-01')),
    ];
    expect(currentClip(clips, 'PACE')?.rating).toBe(55);
  });

  it('scores the card from the same clips the board shows', () => {
    const clips = [
      clip('DRIBBLING', 40, 'RELATIVE', at('05-05')),
      clip('DRIBBLING', 30, 'VERIFIED', at('05-03')),
    ];
    // The verified 30 in full, not half of the newer relative 40: 30/600 × 5 = 0.25 → 0.5.
    expect(computeCardStars(clips, [])).toBe(
      computeCardStars([clip('DRIBBLING', 30, 'VERIFIED')], []),
    );
  });
});

describe('a moderator’s relative rating', () => {
  it('weighs half, like the player’s own number used to, and a coach’s in full', () => {
    const relative = computeCardStars(
      ALL.map((category) => clip(category, 100, 'RELATIVE')),
      [],
    );
    const verified = computeCardStars(
      ALL.map((category) => clip(category, 100, 'VERIFIED')),
      [],
    );
    expect(relative).toBe(2.5);
    expect(verified).toBe(5);
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
