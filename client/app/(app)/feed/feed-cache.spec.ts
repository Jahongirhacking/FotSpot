/**
 * The feed cache patch, and the one thing it must never do: reorder.
 *
 * A like used to invalidate the feed, which refetched every page and let the
 * server's ranking — where a like is the strongest demotion — move the clip the
 * user had just pressed. These hold the replacement to its promise: one clip
 * changes, every other clip is the same object in the same place.
 *
 * Run with `npx tsx --test "app/(app)/feed/feed-cache.spec.ts"`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { FEED_RANKING_TTL_MS, patchFeedPages } from './feed-cache';
import type { FeedClip, FeedPage } from '@/lib/api/types';

const clip = (id: string, likes = 0): FeedClip =>
  ({ id, likes, views: 0, likedByMe: false }) as unknown as FeedClip;

const page = (n: number, items: FeedClip[]): FeedPage => ({
  items,
  total: 100,
  page: n,
  pageSize: items.length,
});

const cached = () => ({
  pageParams: [1, 2],
  pages: [page(1, [clip('a'), clip('b'), clip('c')]), page(2, [clip('d'), clip('e')])],
});

test('changes only the clip it was asked about', () => {
  const next = patchFeedPages(cached(), 'b', (c) => ({ ...c, likes: 9, likedByMe: true }))!;

  const b = next.pages[0].items[1];
  assert.equal(b.likes, 9);
  assert.equal(b.likedByMe, true);
  assert.equal(next.pages[0].items[0].likes, 0);
  assert.equal(next.pages[1].items[0].likes, 0);
});

/*
 * The acceptance criterion, as a property: the order out is the order in.
 * The patched clip is given the most likes of anything on its page, so a
 * patcher that re-ranked — the bug this replaces — would move it.
 */
test('keeps every page and every item in the order it was given', () => {
  const before = cached();
  const next = patchFeedPages(before, 'b', (c) => ({ ...c, likes: 99 }))!;

  assert.deepEqual(
    next.pages.map((p) => p.items.map((i) => i.id)),
    before.pages.map((p) => p.items.map((i) => i.id)),
  );
  assert.deepEqual(next.pageParams, before.pageParams);
});

/*
 * Identity, not just equality. React keys slides by clip id and windows the
 * list; an item that came back as a new object would re-render for no reason,
 * and a page that did would re-measure. Untouched things stay the same things.
 */
test('hands back the untouched clips by reference', () => {
  const before = cached();
  const next = patchFeedPages(before, 'b', (c) => ({ ...c, likes: 1 }))!;

  assert.equal(next.pages[0].items[0], before.pages[0].items[0]);
  assert.equal(next.pages[0].items[2], before.pages[0].items[2]);
  assert.equal(next.pages[1].items[0], before.pages[1].items[0]);
  assert.notEqual(next.pages[0].items[1], before.pages[0].items[1]);
});

test('is a no-op on an empty cache and for an unknown clip', () => {
  assert.equal(
    patchFeedPages(undefined, 'a', (c) => c),
    undefined,
  );

  const before = cached();
  const next = patchFeedPages(before, 'nope', (c) => ({ ...c, likes: 99 }))!;
  assert.deepEqual(
    next.pages.flatMap((p) => p.items.map((i) => i.likes)),
    before.pages.flatMap((p) => p.items.map((i) => i.likes)),
  );
});

/* The snapshot lifetime is an hour, and it is a stale time, not a timer. */
test('holds a ranking for an hour', () => {
  assert.equal(FEED_RANKING_TTL_MS, 60 * 60 * 1000);
});
