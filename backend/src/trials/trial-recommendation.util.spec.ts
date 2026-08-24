import {
  compareNewest,
  compareRecommended,
  distanceKm,
  matchesAge,
  matchesPosition,
  type RankableTrial,
  type ViewerProfile,
} from './trial-recommendation.util';

/**
 * The recommended order.
 *
 * Almost every test here is about a **tie**: a comparator is only correct in
 * terms of what it does when two things are equal on the criterion above, and
 * that is what a fixture can state and a live query cannot. The cascade is the
 * whole specification — age, then position, then distance, then newest — so
 * each block fixes everything above it and varies one thing.
 */

const TASHKENT = { latitude: 41.2995, longitude: 69.2401 };
const SAMARKAND = { latitude: 39.627, longitude: 66.975 }; // ~270km from Tashkent
const CHIRCHIQ = { latitude: 41.4689, longitude: 69.5822 }; // ~33km from Tashkent

const trial = (over: Partial<RankableTrial> = {}): RankableTrial => ({
  ageRangeMin: 12,
  ageRangeMax: 16,
  positions: ['ST'],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  academy: TASHKENT,
  ...over,
});

const viewer = (over: Partial<ViewerProfile> = {}): ViewerProfile => ({
  age: 14,
  positions: ['ST'],
  ...TASHKENT,
  ...over,
});

/* -------------------------------------------------------------------------- */
/* Distance                                                                   */
/* -------------------------------------------------------------------------- */

describe('distanceKm', () => {
  it('measures a real separation to within a few kilometres', () => {
    const km = distanceKm(TASHKENT, SAMARKAND)!;
    expect(km).toBeGreaterThan(265);
    expect(km).toBeLessThan(280);
  });

  it('is zero for the same point, and symmetric', () => {
    expect(distanceKm(TASHKENT, TASHKENT)).toBeCloseTo(0, 6);
    expect(distanceKm(TASHKENT, SAMARKAND)).toBeCloseTo(distanceKm(SAMARKAND, TASHKENT)!, 9);
  });

  /**
   * The reason this is Haversine and not subtraction.
   *
   * A degree of longitude is ~111km at the equator and ~84km at Uzbekistan's
   * latitude. Naive subtraction treats the axes as equal, so an academy due east
   * would measure a third further away than it is — enough to reorder a list.
   */
  it('does not treat a degree of longitude as a degree of latitude', () => {
    const north = distanceKm(TASHKENT, { latitude: 42.2995, longitude: 69.2401 })!;
    const east = distanceKm(TASHKENT, { latitude: 41.2995, longitude: 70.2401 })!;

    expect(north).toBeGreaterThan(east);
    // Naive subtraction would make these identical; the real ratio is ~cos(41°).
    expect(east / north).toBeCloseTo(Math.cos((41.2995 * Math.PI) / 180), 2);
  });

  it.each([
    ['no latitude', { longitude: 69 }],
    ['no longitude', { latitude: 41 }],
    ['nothing at all', {}],
    ['a null half', { latitude: null, longitude: 69 }],
  ])('answers null for %s rather than guessing', (_why, point) => {
    expect(distanceKm(TASHKENT, point)).toBeNull();
    expect(distanceKm(point, TASHKENT)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The two predicates                                                         */
/* -------------------------------------------------------------------------- */

describe('matchesAge', () => {
  it('includes both ends of the range', () => {
    expect(matchesAge(trial({ ageRangeMin: 12, ageRangeMax: 16 }), 12)).toBe(true);
    expect(matchesAge(trial({ ageRangeMin: 12, ageRangeMax: 16 }), 16)).toBe(true);
  });

  it('excludes a year either side', () => {
    expect(matchesAge(trial(), 11)).toBe(false);
    expect(matchesAge(trial(), 17)).toBe(false);
  });

  /* A trial with no range is open on age, so it does not turn anybody away. */
  it('treats a trial with no stated range as open', () => {
    expect(matchesAge(trial({ ageRangeMin: null, ageRangeMax: null }), 30)).toBe(true);
  });

  /* A viewer with no age cannot be matched against a range that exists. */
  it('cannot match a stated range without an age', () => {
    expect(matchesAge(trial(), null)).toBe(false);
    expect(matchesAge(trial({ ageRangeMin: null, ageRangeMax: null }), null)).toBe(true);
  });
});

describe('matchesPosition', () => {
  it('matches on any overlap, not on all of them', () => {
    expect(matchesPosition(trial({ positions: ['ST', 'LW'] }), ['LW', 'CB'])).toBe(true);
  });

  it('does not match a position the trial did not ask for', () => {
    expect(matchesPosition(trial({ positions: ['ST'] }), ['GK'])).toBe(false);
  });

  it('treats a trial wanting no particular position as open', () => {
    expect(matchesPosition(trial({ positions: [] }), ['GK'])).toBe(true);
  });

  it('cannot match a stated want against a player with no position', () => {
    expect(matchesPosition(trial({ positions: ['ST'] }), [])).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* The cascade, which is the actual specification                             */
/* -------------------------------------------------------------------------- */

describe('compareRecommended', () => {
  const sorted = (trials: RankableTrial[], v = viewer()) =>
    [...trials].sort((a, b) => compareRecommended(a, b, v));

  /** 1. Age outranks everything below it. */
  it('puts an age match above a nearer trial the player is too young for', () => {
    const eligibleFar = trial({ academy: SAMARKAND, ageRangeMin: 12, ageRangeMax: 16 });
    const ineligibleNear = trial({ academy: TASHKENT, ageRangeMin: 18, ageRangeMax: 21 });

    expect(sorted([ineligibleNear, eligibleFar])[0]).toBe(eligibleFar);
  });

  /** 2. Position, once age has tied. */
  it('puts a position match above a nearer trial wanting another position', () => {
    const wantedFar = trial({ academy: SAMARKAND, positions: ['ST'] });
    const unwantedNear = trial({ academy: TASHKENT, positions: ['GK'] });

    expect(sorted([unwantedNear, wantedFar])[0]).toBe(wantedFar);
  });

  /* Position must not outrank age — the two together, as the brief states. */
  it('keeps age above position when they disagree', () => {
    const rightAgeWrongPosition = trial({ ageRangeMin: 12, ageRangeMax: 16, positions: ['GK'] });
    const wrongAgeRightPosition = trial({ ageRangeMin: 18, ageRangeMax: 21, positions: ['ST'] });

    expect(sorted([wrongAgeRightPosition, rightAgeWrongPosition])[0]).toBe(rightAgeWrongPosition);
  });

  /** 3. Distance, once age and position have tied — the brief's own example. */
  it('orders equally-matching trials nearest first', () => {
    const near = trial({ academy: TASHKENT });
    const middle = trial({ academy: CHIRCHIQ });
    const far = trial({ academy: SAMARKAND });

    expect(sorted([far, near, middle])).toEqual([near, middle, far]);
  });

  /*
   * An academy that has not said where it is sorts last among its equals.
   * Guessing zero would promote it above every academy that did say, which
   * rewards the missing data.
   */
  it('sorts an academy with no coordinates last among equals', () => {
    const known = trial({ academy: SAMARKAND });
    const unknown = trial({ academy: {} });

    expect(sorted([unknown, known])).toEqual([known, unknown]);
  });

  it('still ranks by age and position when the viewer has no coordinates', () => {
    const nomad = viewer({ latitude: null, longitude: null });
    const match = trial({ ageRangeMin: 12, ageRangeMax: 16 });
    const miss = trial({ ageRangeMin: 18, ageRangeMax: 21 });

    expect(sorted([miss, match], nomad)[0]).toBe(match);
  });

  /** 4. Newest, once everything above has tied. */
  it('breaks a complete tie with the newest trial', () => {
    const older = trial({ createdAt: new Date('2026-01-01T00:00:00Z') });
    const newer = trial({ createdAt: new Date('2026-06-01T00:00:00Z') });

    expect(sorted([older, newer])).toEqual([newer, older]);
  });

  /* A comparator that is not consistent produces a different list depending on
     the order it started in — a bug that only shows up in production. */
  it('produces the same order whatever order it started in', () => {
    const trials = [
      trial({ academy: SAMARKAND, positions: ['GK'] }),
      trial({ academy: TASHKENT, ageRangeMin: 18, ageRangeMax: 21 }),
      trial({ academy: CHIRCHIQ }),
      trial({ academy: TASHKENT, createdAt: new Date('2026-09-01T00:00:00Z') }),
    ];
    const forward = sorted(trials).map((t) => t.academy);
    const backward = sorted([...trials].reverse()).map((t) => t.academy);

    expect(forward).toEqual(backward);
  });
});

describe('compareNewest', () => {
  it('puts the most recently published first', () => {
    const older = trial({ createdAt: new Date('2026-01-01T00:00:00Z') });
    const newer = trial({ createdAt: new Date('2026-06-01T00:00:00Z') });

    expect([older, newer].sort(compareNewest)).toEqual([newer, older]);
  });

  /*
   * `createdAt` and not the trial's own date: an open-ended trial has no date at
   * all, and would otherwise have no place in the order.
   */
  it('orders open-ended trials alongside dated ones', () => {
    const dated = trial({ createdAt: new Date('2026-01-01T00:00:00Z') });
    const openEnded = trial({ createdAt: new Date('2026-06-01T00:00:00Z') });

    expect([dated, openEnded].sort(compareNewest)[0]).toBe(openEnded);
  });
});
