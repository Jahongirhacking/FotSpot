import { startOfUtcDay } from './view-day.util';

describe('startOfUtcDay', () => {
  it('truncates to midnight UTC', () => {
    expect(startOfUtcDay(new Date('2026-08-17T14:32:09.123Z')).toISOString()).toBe(
      '2026-08-17T00:00:00.000Z',
    );
  });

  /**
   * The bucket is half of a unique constraint, so two moments on the same UTC
   * day must produce the identical value — not merely a similar one.
   */
  it('gives the same bucket for any two moments in one UTC day', () => {
    const dawn = startOfUtcDay(new Date('2026-08-17T00:00:00.000Z'));
    const midnightMinusOne = startOfUtcDay(new Date('2026-08-17T23:59:59.999Z'));
    expect(dawn.getTime()).toBe(midnightMinusOne.getTime());
  });

  it('rolls over at UTC midnight, not before', () => {
    const lateOn17th = startOfUtcDay(new Date('2026-08-17T23:59:59.999Z'));
    const earlyOn18th = startOfUtcDay(new Date('2026-08-18T00:00:00.000Z'));
    expect(earlyOn18th.getTime()).toBeGreaterThan(lateOn17th.getTime());
    expect(earlyOn18th.toISOString()).toBe('2026-08-18T00:00:00.000Z');
  });

  /*
   * The one that would silently break the constraint.
   *
   * A local-time implementation puts 23:00 UTC into the *next* day for a viewer
   * east of Greenwich, so the same person could hold two daily rows for one
   * clip. Asserted against an explicitly non-UTC moment rather than trusting
   * that the machine running the tests is on UTC.
   */
  it('ignores the host machine timezone', () => {
    // 22:30 in Tashkent (UTC+5) on the 18th is 17:30 UTC on the same day.
    expect(startOfUtcDay(new Date('2026-08-18T17:30:00.000Z')).toISOString()).toBe(
      '2026-08-18T00:00:00.000Z',
    );
    // 02:00 in Tashkent on the 19th is 21:00 UTC on the 18th — still the 18th.
    expect(startOfUtcDay(new Date('2026-08-18T21:00:00.000Z')).toISOString()).toBe(
      '2026-08-18T00:00:00.000Z',
    );
  });
});
