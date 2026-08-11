/**
 * Age in whole years on a given date.
 *
 * Always "at a date", never "now": every question this platform asks about age
 * is asked about the day of a trial, not the day somebody opens the screen. A
 * fourteen-year-old who turns fifteen the week before an U14 session is not
 * eligible for it, and computing from `new Date()` would have said otherwise for
 * as long as the trial sat in the future.
 */
export function ageAt(birthDate: Date, atDate: Date): number {
  let age = atDate.getFullYear() - birthDate.getFullYear();
  const hasHadBirthday =
    atDate.getMonth() > birthDate.getMonth() ||
    (atDate.getMonth() === birthDate.getMonth() && atDate.getDate() >= birthDate.getDate());
  if (!hasHadBirthday) age -= 1;
  return age;
}

/**
 * The birth date of somebody turning exactly `age` on `atDate` — `ageAt` run
 * backwards.
 *
 * Exists so an age range can be asked of the database as a birth-date window
 * instead of by reading every player and computing ages in memory. `ageAt`
 * cannot appear in a `where` clause; a date comparison against an indexed column
 * can, and the two must agree exactly or a player is told about a trial they
 * will then be refused from.
 *
 * Read it as a boundary rather than a person's birthday: for a maximum age of
 * 16, everyone eligible was born strictly after `birthDateForAge(date, 17)`.
 */
export function birthDateForAge(atDate: Date, age: number): Date {
  const born = new Date(atDate);
  born.setFullYear(born.getFullYear() - age);
  return born;
}
