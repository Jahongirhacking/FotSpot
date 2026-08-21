import {
  ageReferenceDate,
  isOpenEnded,
  patchedDate,
  TIME_PATTERN,
  validateWindow,
} from './trial-window.util';

/**
 * The trial window, and what a missing field means.
 *
 * Every interesting case here is an absence — no date, one time, an end without
 * a start — which is exactly what a fixture produces on demand and a running
 * system rarely does. Two of them decide whether a fourteen-year-old may apply.
 */

const D = (iso: string) => new Date(iso);

const dated = {
  startsAt: D('2026-09-16T00:00:00Z'),
  endsAt: D('2026-09-25T00:00:00Z'),
  startTime: '09:00',
  endTime: '18:00',
  applyDeadline: D('2026-09-15T00:00:00Z'),
};

const openEnded = {
  startsAt: null,
  endsAt: null,
  startTime: null,
  endTime: null,
  applyDeadline: null,
};

describe('an open-ended trial', () => {
  /** The whole point of the feature: no dates, and that is not an error. */
  it('is valid with nothing filled in at all', () => {
    expect(validateWindow(openEnded)).toBeNull();
  });

  it('is recognised as open-ended', () => {
    expect(isOpenEnded({ date: null })).toBe(true);
    expect(isOpenEnded({ date: D('2026-09-16T00:00:00Z') })).toBe(false);
  });

  /* A time window with no day cannot be rendered, and an end date with no start
     is a trial that finishes before it begins. */
  it.each([
    ['an end date', { ...openEnded, endsAt: D('2026-09-25T00:00:00Z') }],
    ['a start time', { ...openEnded, startTime: '09:00' }],
    ['an end time', { ...openEnded, endTime: '18:00' }],
  ])('rejects %s with no start date', (_why, window) => {
    expect(validateWindow(window)).toBe('time-without-date');
  });
});

describe('a dated trial', () => {
  it('accepts a full window', () => {
    expect(validateWindow(dated)).toBeNull();
  });

  /* A one-day trial is the same date twice, which is ordinary, not an error. */
  it('accepts a window that starts and ends on the same day', () => {
    expect(validateWindow({ ...dated, endsAt: dated.startsAt })).toBeNull();
  });

  it('rejects an end date before the start', () => {
    expect(validateWindow({ ...dated, endsAt: D('2026-09-15T00:00:00Z') })).toBe(
      'end-before-start',
    );
  });

  it('rejects an end time at or before the start time', () => {
    expect(validateWindow({ ...dated, endTime: '08:00' })).toBe('end-time-before-start-time');
    expect(validateWindow({ ...dated, endTime: '09:00' })).toBe('end-time-before-start-time');
  });

  /* Times are compared as text, so this checks the ordering actually holds
     across the digit-count boundary a naive comparison gets wrong. */
  it('orders times correctly across the 09/10 boundary', () => {
    expect(validateWindow({ ...dated, startTime: '09:00', endTime: '10:00' })).toBeNull();
    expect(validateWindow({ ...dated, startTime: '10:00', endTime: '09:00' })).toBe(
      'end-time-before-start-time',
    );
  });

  it('rejects one time without the other', () => {
    expect(validateWindow({ ...dated, endTime: null })).toBe('partial-time');
    expect(validateWindow({ ...dated, startTime: null })).toBe('partial-time');
  });

  it('rejects a deadline after the trial starts', () => {
    expect(validateWindow({ ...dated, applyDeadline: D('2026-09-17T00:00:00Z') })).toBe(
      'deadline-after-start',
    );
  });

  it('accepts a deadline on the opening day itself', () => {
    expect(validateWindow({ ...dated, applyDeadline: dated.startsAt })).toBeNull();
  });
});

/*
 * The shape every trial had before this feature: a date and a deadline, no end
 * and no times. Rejecting it would break clients that predate the window — see
 * the note on `validateWindow`.
 */
describe('backward compatibility with the old single-date trial', () => {
  it('accepts a start date with no end and no times', () => {
    expect(
      validateWindow({
        startsAt: D('2026-09-16T10:00:00Z'),
        endsAt: null,
        startTime: null,
        endTime: null,
        applyDeadline: D('2026-09-15T00:00:00Z'),
      }),
    ).toBeNull();
  });

  it('still enforces the deadline rule on that shape', () => {
    expect(
      validateWindow({
        startsAt: D('2026-09-16T10:00:00Z'),
        endsAt: null,
        startTime: null,
        endTime: null,
        applyDeadline: D('2026-09-20T00:00:00Z'),
      }),
    ).toBe('deadline-after-start');
  });
});

/* -------------------------------------------------------------------------- */
/* Age, which is the part that decides who may apply                          */
/* -------------------------------------------------------------------------- */

describe('ageReferenceDate', () => {
  const now = D('2026-08-21T00:00:00Z');

  it('judges a dated trial on its own date', () => {
    const date = D('2026-09-16T00:00:00Z');
    expect(ageReferenceDate({ date }, now)).toBe(date);
  });

  /*
   * The alternative — treating a missing date as "no age limit" — would widen a
   * 12–14 trial to everybody, which is the opposite of what the manager typed.
   */
  it('judges an open-ended trial today', () => {
    expect(ageReferenceDate({ date: null }, now)).toBe(now);
  });
});

describe('TIME_PATTERN', () => {
  it.each(['00:00', '09:00', '18:30', '23:59'])('accepts %s', (value) => {
    expect(TIME_PATTERN.test(value)).toBe(true);
  });

  it.each(['24:00', '9:00', '09:60', '0900', '09:00:00', '', 'nine'])(
    'rejects %s',
    (value) => {
      expect(TIME_PATTERN.test(value)).toBe(false);
    },
  );
});

/* -------------------------------------------------------------------------- */
/* PATCH: absent and null are different requests                              */
/* -------------------------------------------------------------------------- */

describe('patchedDate', () => {
  const stored = D('2026-09-16T00:00:00Z');

  it('leaves the stored value alone when the field is absent', () => {
    expect(patchedDate(undefined, stored)).toBe(stored);
  });

  /**
   * The bug this exists for.
   *
   * `new Date(null)` is **the epoch**, not `Invalid Date`, so the obvious
   * ternary turned "clear the date" into "date = 1 January 1970" — a date in the
   * past, which drops the trial out of every upcoming list without saying so.
   * Un-ticking "is this a dated trial?" is exactly the request that sends null.
   */
  it('clears the value when the field is explicitly null', () => {
    expect(patchedDate(null, stored)).toBeNull();
  });

  it('does not turn a null into the epoch', () => {
    expect(patchedDate(null, stored)).not.toEqual(new Date(0));
  });

  it('parses a supplied date', () => {
    expect(patchedDate('2026-10-01T00:00:00Z', stored)).toEqual(D('2026-10-01T00:00:00Z'));
  });

  it('clears a value that was already null, and keeps one that was', () => {
    expect(patchedDate(undefined, null)).toBeNull();
    expect(patchedDate(null, null)).toBeNull();
  });
});
