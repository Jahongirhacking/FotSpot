import { BadRequestException } from '@nestjs/common';

/**
 * When a clip was recorded, as the player says — bounded to "not after today".
 *
 * ## Whose today
 *
 * The product's, not the server's. FotSpot is Uzbek and the API runs in UTC,
 * so at 02:00 in Tashkent the server's calendar still says yesterday; a player
 * filing a clip they shot "today" must not be told that today is in the
 * future. Every comparison here is made on the calendar date in
 * `Asia/Tashkent`, the same zone the site's structured data declares.
 *
 * ## Two shapes of input
 *
 * The uploader sends a bare date (`2026-09-04`) when the player picked one,
 * and nothing when they left "automatic date" on — then it is now. A bare
 * date is stored as noon in Tashkent, so it survives being shown in any zone
 * as the day it names. A full timestamp is kept as given and judged by the
 * Tashkent day it falls on.
 */
export const PRODUCT_TIME_ZONE = 'Asia/Tashkent';
/** Tashkent has no daylight saving; the offset is a constant. */
const PRODUCT_UTC_OFFSET = '+05:00';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar date of `at` in the product's time zone, as `YYYY-MM-DD`. */
export function calendarDateIn(at: Date, timeZone = PRODUCT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export const RECORDED_IN_FUTURE = 'The recording date cannot be in the future.';

export function parseRecordedAt(input: string | undefined | null, now = new Date()): Date {
  if (input === undefined || input === null || input.trim() === '') return now;

  const dateOnly = DATE_ONLY.test(input);
  const value = dateOnly ? new Date(`${input}T12:00:00${PRODUCT_UTC_OFFSET}`) : new Date(input);
  if (Number.isNaN(value.getTime())) {
    throw new BadRequestException('That is not a recording date.');
  }

  const day = dateOnly ? input : calendarDateIn(value);
  if (day > calendarDateIn(now)) throw new BadRequestException(RECORDED_IN_FUTURE);
  return value;
}
