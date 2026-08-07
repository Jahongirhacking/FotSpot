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
