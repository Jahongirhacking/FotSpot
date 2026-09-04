/**
 * The recording date a player gives a clip, on the client side.
 *
 * The date input works in the browser's local calendar, so "today" here is the
 * player's own today — which is what they mean. The API judges the same value
 * against today in Asia/Tashkent, so a date can never slip through that the
 * server would call the future.
 */

/** Today as a `<input type="date">` value, in the browser's local calendar. */
export function todayInputValue(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whether a `YYYY-MM-DD` value names a day after today. */
export function isAfterToday(value: string, now = new Date()): boolean {
  return value > todayInputValue(now);
}
