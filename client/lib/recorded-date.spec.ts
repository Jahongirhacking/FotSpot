/**
 * Run with `npx tsx --test lib/recorded-date.spec.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { isAfterToday, todayInputValue } from './recorded-date';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

test('today is the local calendar date, zero-padded', () => {
  assert.equal(todayInputValue(at(2026, 9, 4)), '2026-09-04');
  assert.equal(todayInputValue(at(2026, 1, 7)), '2026-01-07');
});

test('today and the past are allowed; tomorrow is not', () => {
  const now = at(2026, 9, 4);
  assert.equal(isAfterToday('2026-09-04', now), false);
  assert.equal(isAfterToday('2026-09-03', now), false);
  assert.equal(isAfterToday('2026-05-10', now), false);
  assert.equal(isAfterToday('2026-09-05', now), true);
});

/* Late evening is still today: the local date, not the UTC one, decides. */
test('judges by the local day even late at night', () => {
  assert.equal(isAfterToday('2026-09-04', at(2026, 9, 4, 23)), false);
});
