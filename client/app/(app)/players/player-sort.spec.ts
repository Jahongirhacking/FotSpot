/**
 * What "no sort" means on the players board, and that the page and the
 * filters read the URL the same way.
 *
 * Run with `npx tsx --test "app/(app)/players/player-sort.spec.ts"`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { NEWEST_SORT, resolvePlayerSort } from './player-sort';

test('no sort in the URL means stars, most first', () => {
  const sort = resolvePlayerSort({});

  assert.equal(sort.choice, 'stars');
  assert.equal(sort.order, 'desc');
  assert.deepEqual(sort.api, { sort: 'stars', order: 'desc' });
});

test('an empty sort is the same as none', () => {
  assert.deepEqual(resolvePlayerSort({ sort: '', order: null }).api, {
    sort: 'stars',
    order: 'desc',
  });
});

/* Newest is a choice of its own now, and it is what the API calls "no sort". */
test('newest asks the API for its own default by sending no sort', () => {
  const sort = resolvePlayerSort({ sort: NEWEST_SORT });

  assert.equal(sort.choice, 'newest');
  assert.deepEqual(sort.api, {});
});

test('a direction in the URL wins over the default', () => {
  assert.equal(resolvePlayerSort({ sort: 'stars', order: 'asc' }).order, 'asc');
  assert.deepEqual(resolvePlayerSort({ sort: 'name', order: 'desc' }).api, {
    sort: 'name',
    order: 'desc',
  });
});

/* The direction shown must be the direction the API used. */
test('column sorts default to ascending, as the API does', () => {
  for (const choice of ['name', 'age', 'recommendations'] as const) {
    assert.equal(resolvePlayerSort({ sort: choice }).order, 'asc', choice);
  }
});

test('a nonsense direction falls back to the sort’s default', () => {
  assert.equal(resolvePlayerSort({ sort: 'stars', order: 'sideways' }).order, 'desc');
});

/* Fails loudly at the API rather than quietly showing a different list. */
test('an unknown sort is passed through, not replaced', () => {
  assert.equal(resolvePlayerSort({ sort: 'shoe_size' }).api.sort, 'shoe_size');
});
