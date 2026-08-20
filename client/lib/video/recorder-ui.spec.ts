/**
 * The recorder's display decisions.
 *
 * Neither of these fails loudly: a drifting timer still counts and a badly
 * cropped preview still records. The person finds out afterwards, watching back
 * a clip framed differently from the one they thought they were shooting.
 *
 * Run with `npx tsx --test lib/video/recorder-ui.spec.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { formatTimer, previewFit } from './recorder-ui';

test('formatTimer pads to a stable width', () => {
  assert.equal(formatTimer(0), '00:00');
  assert.equal(formatTimer(9), '00:09');
  assert.equal(formatTimer(14), '00:14');
  assert.equal(formatTimer(59), '00:59');
  assert.equal(formatTimer(60), '01:00');
});

/* The timer is driven by elapsed wall-clock, so it arrives as a fraction. */
test('formatTimer floors a partial second rather than rounding up', () => {
  assert.equal(formatTimer(13.99), '00:13');
  assert.equal(formatTimer(0.4), '00:00');
});

test('formatTimer never renders a negative clock', () => {
  assert.equal(formatTimer(-5), '00:00');
});

/*
 * A portrait phone filming portrait, or a laptop filming landscape: the two
 * agree, so `cover` fills the screen and trims almost nothing.
 */
test('previewFit covers when the camera matches the screen', () => {
  assert.equal(previewFit(9 / 16, 9 / 16), 'cover');
  assert.equal(previewFit(16 / 9, 16 / 9), 'cover');
  assert.equal(previewFit(0.5625, 0.52), 'cover');
});

/*
 * A landscape sensor on a portrait phone. `cover` would hide most of the width
 * from the person composing the shot — and the recording keeps that width, so
 * they would frame a clip whose edges they never saw.
 */
test('previewFit contains when cropping would hide the frame', () => {
  assert.equal(previewFit(16 / 9, 9 / 16), 'contain');
  assert.equal(previewFit(9 / 16, 16 / 9), 'contain');
  assert.equal(previewFit(4 / 3, 9 / 16), 'contain');
});

test('previewFit is symmetric — neither orientation is privileged', () => {
  assert.equal(previewFit(16 / 9, 3 / 4), previewFit(3 / 4, 16 / 9));
});

/* `cover` is the better guess while metadata is still loading. */
test('previewFit falls back to cover when nothing has been measured', () => {
  assert.equal(previewFit(null, 9 / 16), 'cover');
  assert.equal(previewFit(9 / 16, undefined), 'cover');
  assert.equal(previewFit(0, 1), 'cover');
  assert.equal(previewFit(NaN, 1), 'cover');
});

/* Whatever it answers, it is never the one that stretches. */
test('previewFit never returns fill', () => {
  for (const camera of [0.4, 0.5625, 0.75, 1, 1.33, 1.78, 2.4]) {
    for (const viewport of [0.46, 0.5625, 1, 1.78]) {
      assert.ok(['cover', 'contain'].includes(previewFit(camera, viewport)));
    }
  }
});
