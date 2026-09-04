import { BadRequestException } from '@nestjs/common';
import { calendarDateIn, parseRecordedAt, RECORDED_IN_FUTURE } from './recorded-at.util';

/**
 * "Not after today", judged in Tashkent. The interesting cases are the hours
 * when the server's UTC calendar and the player's disagree.
 */
describe('parseRecordedAt', () => {
  // 04 Sep 2026, 10:00 in Tashkent (05:00 UTC).
  const NOW = new Date('2026-09-04T05:00:00Z');

  it('defaults to now when nothing was sent', () => {
    expect(parseRecordedAt(undefined, NOW)).toBe(NOW);
    expect(parseRecordedAt('', NOW)).toBe(NOW);
  });

  it('allows today', () => {
    expect(calendarDateIn(parseRecordedAt('2026-09-04', NOW))).toBe('2026-09-04');
  });

  it('allows any earlier date', () => {
    expect(calendarDateIn(parseRecordedAt('2026-09-03', NOW))).toBe('2026-09-03');
    expect(calendarDateIn(parseRecordedAt('2026-05-10', NOW))).toBe('2026-05-10');
  });

  it('refuses tomorrow and anything after it', () => {
    expect(() => parseRecordedAt('2026-09-05', NOW)).toThrow(BadRequestException);
    expect(() => parseRecordedAt('2026-09-05', NOW)).toThrow(RECORDED_IN_FUTURE);
    expect(() => parseRecordedAt('2027-01-01', NOW)).toThrow(RECORDED_IN_FUTURE);
  });

  /*
   * 02:30 on 5 Sep in Tashkent is still 4 Sep in UTC. A player filing the
   * clip they shot "today" means the 5th, and the 5th is not the future.
   */
  it('judges today by the product’s calendar, not the server’s', () => {
    const smallHours = new Date('2026-09-04T21:30:00Z');

    expect(() => parseRecordedAt('2026-09-05', smallHours)).not.toThrow();
    expect(() => parseRecordedAt('2026-09-06', smallHours)).toThrow(RECORDED_IN_FUTURE);
  });

  it('keeps a bare date on the day it names, whatever zone reads it back', () => {
    const stored = parseRecordedAt('2026-05-10', NOW);

    expect(calendarDateIn(stored, 'UTC')).toBe('2026-05-10');
    expect(calendarDateIn(stored, 'America/Los_Angeles')).toBe('2026-05-10');
  });

  it('accepts a full timestamp and judges it by its Tashkent day', () => {
    expect(() => parseRecordedAt('2026-09-04T04:00:00Z', NOW)).not.toThrow();
    // 20:00 UTC on the 4th is 01:00 on the 5th in Tashkent — tomorrow, from 10:00.
    expect(() => parseRecordedAt('2026-09-04T20:00:00Z', NOW)).toThrow(RECORDED_IN_FUTURE);
  });

  it('refuses something that is not a date at all', () => {
    expect(() => parseRecordedAt('yesterday-ish', NOW)).toThrow(BadRequestException);
  });
});
