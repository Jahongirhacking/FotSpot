/**
 * What reaches `<meta name="keywords">`.
 *
 * The stored list is already normalised by the server, so these are about the
 * *second* pass: merging operator keywords with terms taken from the page's real
 * content without repeating either, and refusing to emit a tag at all when there
 * is nothing to say.
 *
 * Run with `npx tsx --test lib/seo.spec.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { absoluteUrl, jsonLd, seoKeywords } from './seo';

test('keeps the operator keywords in the order they were saved', () => {
  assert.deepEqual(seoKeywords(['tashkent football academy', 'youth football']), [
    'tashkent football academy',
    'youth football',
  ]);
});

test('appends terms from the page content after the operator keywords', () => {
  assert.deepEqual(seoKeywords(['youth football'], ['Shurtan FC', 'Qashqadaryo']), [
    'youth football',
    'Shurtan FC',
    'Qashqadaryo',
  ]);
});

/*
 * The stuffing case §13 is about: an academy whose keyword list already contains
 * its own name must not have that name emitted twice.
 */
test('never repeats a term the operator already saved', () => {
  assert.deepEqual(seoKeywords(['Shurtan FC', 'youth football'], ['Shurtan FC']), [
    'Shurtan FC',
    'youth football',
  ]);
});

test('treats a case or whitespace difference as the same term', () => {
  assert.deepEqual(seoKeywords(['Shurtan FC'], ['shurtan  fc', 'SHURTAN FC']), ['Shurtan FC']);
});

/*
 * `undefined` and not `[]`: Next omits the tag entirely for undefined, where an
 * empty array renders `content=""` — a meta tag that says nothing.
 */
test('emits no tag at all when there is nothing to say', () => {
  assert.equal(seoKeywords([], []), undefined);
  assert.equal(seoKeywords(undefined), undefined);
  assert.equal(seoKeywords(null), undefined);
});

test('an academy with no keywords still gets its own name and region', () => {
  assert.deepEqual(seoKeywords([], ['Shurtan FC', 'Qashqadaryo']), ['Shurtan FC', 'Qashqadaryo']);
});

/* A trial with no location, an academy with no region: the gaps are skipped
   rather than becoming empty entries in the list. */
test('skips missing content terms rather than emitting blanks', () => {
  assert.deepEqual(seoKeywords(['real'], [null, undefined, '', '   ']), ['real']);
});

/*
 * Keywords are operator-supplied text. Nothing is stripped here on purpose:
 * `metadata.keywords` is a **data** API, and Next escapes when it renders the
 * tag — so the value must arrive intact for that escaping to work on the real
 * thing. What this asserts is that no code path concatenates it into markup.
 */
test('passes markup through as data rather than half-cleaning it', () => {
  const nasty = '"><script>alert(1)</script>';

  assert.deepEqual(seoKeywords([nasty]), [nasty]);
});

/*
 * `jsonLd` is the one place this file does build a string that lands in HTML, so
 * it is the one place escaping is this file's job.
 */
test('jsonLd escapes a closing tag so it cannot break out of the script', () => {
  const { __html } = jsonLd({ name: '</script><img src=x onerror=alert(1)>' });

  assert.equal(__html.includes('</script>'), false);
  assert.equal(__html.includes('\\u003c/script>'), true);
});

test('absoluteUrl builds a full URL from a path either way round', () => {
  assert.equal(absoluteUrl('/trials/1').endsWith('/trials/1'), true);
  assert.equal(absoluteUrl('trials/1').endsWith('/trials/1'), true);
});
