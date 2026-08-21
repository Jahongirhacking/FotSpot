/**
 * The trial's dates and times, and what they mean when they are absent.
 *
 * Pure and DI-free like `scout-level.util.ts`, so every rule below is testable
 * without a database. That matters more than usual here: these decide whether a
 * fourteen-year-old may apply, and the interesting cases are all about a field
 * being *missing*, which is exactly what a fixture is good at and a running
 * system rarely produces on demand.
 */

/**
 * The date a player's age is judged against.
 *
 * ## Why an open-ended trial judges age today
 *
 * A dated trial asks "how old will they be on the day?" — that is the rule the
 * age range states, and `README` §1.9 words it as age on the day of the trial.
 * An open-ended trial has no such day, so the question has to be asked about
 * some other moment, and "now" is the only one that is both defined and honest:
 * the academy is selecting continuously, so the player who applies today is
 * tested at roughly today's age.
 *
 * The alternative — treating a missing date as "no age limit" — would quietly
 * widen every open-ended trial to everybody, which is the opposite of what a
 * manager who typed 12–14 asked for.
 *
 * `now` is injected so a test can state the day rather than depend on the clock.
 */
export function ageReferenceDate(
  trial: { date: Date | null },
  now: Date = new Date(),
): Date {
  return trial.date ?? now;
}

/** A trial with no start date runs until the academy closes it. */
export function isOpenEnded(trial: { date: Date | null }): boolean {
  return trial.date === null;
}

export type WindowProblem =
  | 'end-before-start'
  | 'end-time-before-start-time'
  | 'deadline-after-start'
  | 'time-without-date'
  | 'partial-time';

export interface TrialWindow {
  /** Start of the window, or null for an open-ended trial. */
  startsAt: Date | null;
  endsAt: Date | null;
  /** `HH:mm`, wall clock. */
  startTime: string | null;
  endTime: string | null;
  applyDeadline: Date | null;
}

/**
 * What a window has to satisfy to be storable, or why it does not.
 *
 * Returns `null` when the window is fine. The caller turns a reason into a
 * `BadRequestException`, so the wording lives at the edge and the rules here.
 *
 * ## Why this is looser than the form
 *
 * The creation form asks for all four fields once "Muddatli" is ticked, and it
 * is right to: a manager who has said the trial is dated should say when it
 * starts *and* ends. But this is the API, and a caller that sends only `date`
 * is the shape every trial used before this feature existed — the old
 * `{ date, applyDeadline }` body. Rejecting it here would break clients that
 * predate the window and every trial already scripted against the endpoint, to
 * enforce a rule the UI enforces anyway.
 *
 * So the API's rule is the weaker, structural one: nothing may be *impossible*.
 * A start date with no end is a one-day trial. A time window with no day to
 * apply it to is not.
 */
export function validateWindow(window: TrialWindow): WindowProblem | null {
  const { startsAt, endsAt, startTime, endTime, applyDeadline } = window;

  if (!startsAt) {
    /*
     * Open-ended. The rest of the window has to be absent too: "09:00–18:00"
     * with no day is a window nothing can display, and an end date without a
     * start is a trial that finishes before it begins.
     */
    if (endsAt || startTime || endTime) return 'time-without-date';
    return null;
  }

  /*
   * Same-day is allowed; earlier is not. A one-day trial is entered as the same
   * date twice, which is the ordinary case and must not be an error.
   */
  if (endsAt && endsAt.getTime() < startsAt.getTime()) return 'end-before-start';

  // A daily window is two times or none — one alone cannot be rendered.
  if (Boolean(startTime) !== Boolean(endTime)) return 'partial-time';

  /*
   * Compared as text.
   *
   * `HH:mm` zero-padded orders correctly under a plain string comparison —
   * `"09:00" < "18:00"` — so this needs no parsing and cannot drift into a
   * timezone. Equal is rejected: a window that starts and ends at the same
   * minute is not a window.
   */
  if (startTime && endTime && endTime <= startTime) return 'end-time-before-start-time';

  // Applications must close by the time the trial starts: a list that closes
  // after the first session is a list nobody can act on.
  if (applyDeadline && applyDeadline.getTime() > startsAt.getTime()) {
    return 'deadline-after-start';
  }

  return null;
}

/** `HH:mm`, 24-hour, zero-padded. Anything else is not a time we can store. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One field of a PATCH, where absent and `null` mean different things.
 *
 * `undefined` — the field was not in the body: leave what is stored alone.
 * `null` — the field was sent as null: **clear it**. That is how un-ticking
 * "is this a dated trial?" reaches the database; omitting the field instead
 * would make the change a no-op and leave the dates the manager just removed.
 *
 * The reason this is a named function rather than a ternary at each site is
 * `new Date(null)`, which is not `Invalid Date` — it is **the epoch**. So the
 * obvious `dto.date !== undefined ? new Date(dto.date) : trial.date` turns a
 * request to clear the date into a trial dated 1 January 1970: a date in the
 * past, which quietly drops the trial out of every upcoming list.
 */
export function patchedDate(
  incoming: string | null | undefined,
  current: Date | null,
): Date | null {
  if (incoming === undefined) return current;
  if (incoming === null) return null;
  return new Date(incoming);
}
