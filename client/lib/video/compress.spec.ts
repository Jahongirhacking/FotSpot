/**
 * The decisions the compressor makes before it touches a single frame.
 *
 * Every rule about aspect ratio lives in `targetDimension`, and it is the one
 * part of this feature that can be wrong without anything failing: a stretched
 * clip encodes perfectly, uploads perfectly, plays perfectly and is wrong. So the
 * examples below are the specification, checked.
 *
 * The encode itself is not tested here and cannot be — it needs a real browser
 * with a real hardware encoder and real video files. See the report for what was
 * verified by hand and what still needs a device.
 *
 * Run with `npx tsx --test lib/video/compress.spec.ts` (the client has no test
 * runner wired up — see client/CLAUDE.md §9 — so this is plain `node:test`, the
 * same arrangement as `lib/api/browser.spec.ts`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUDIO_BITRATE,
  MAX_FPS,
  MAX_LONG_EDGE,
  estimatedBytes,
  targetDimension,
  videoBitrateFor,
} from './compress';

test('landscape is capped on its width', () => {
  assert.deepEqual(targetDimension(1920, 1080), { width: MAX_LONG_EDGE });
  assert.deepEqual(targetDimension(2560, 1440), { width: MAX_LONG_EDGE });
});

test('portrait is capped on its height', () => {
  assert.deepEqual(targetDimension(1080, 1920), { height: MAX_LONG_EDGE });
  assert.deepEqual(targetDimension(1440, 2560), { height: MAX_LONG_EDGE });
  assert.deepEqual(targetDimension(2160, 3840), { height: MAX_LONG_EDGE });
});

/*
 * Only ever one dimension. Asking for both is how a clip gets stretched or
 * letterboxed, and a phone recording in the feed is almost always portrait.
 */
test('never constrains both dimensions at once', () => {
  for (const [w, h] of [
    [1920, 1080],
    [1080, 1920],
    [2560, 1440],
    [1000, 3000],
  ]) {
    const target = targetDimension(w, h);
    assert.ok(target, `${w}x${h} should be resized`);
    assert.equal(Object.keys(target).length, 1);
  }
});

test('the deduced side keeps the aspect ratio', () => {
  // What the encoder will work out from a single constrained dimension.
  const deduce = (w: number, h: number) => {
    const target = targetDimension(w, h);
    if (!target) return [w, h];
    return 'width' in target
      ? [target.width, Math.round((h / w) * target.width)]
      : [Math.round((w / h) * target.height), target.height];
  };

  assert.deepEqual(deduce(1920, 1080), [1280, 720]);
  assert.deepEqual(deduce(1080, 1920), [720, 1280]);
  assert.deepEqual(deduce(2560, 1440), [1280, 720]);
  assert.deepEqual(deduce(1440, 2560), [720, 1280]);
  assert.deepEqual(deduce(2160, 3840), [720, 1280]);
});

/* A 1080×1080 square is inside the box, so it stays exactly as it is. */
test('a square already inside the box is left alone', () => {
  assert.equal(targetDimension(1080, 1080), null);
});

test('a square larger than the box is capped on either side equally', () => {
  assert.deepEqual(targetDimension(2000, 2000), { width: MAX_LONG_EDGE });
});

/* Upscaling invents detail that was never filmed and costs bitrate to carry. */
test('never upscales a small clip', () => {
  assert.equal(targetDimension(640, 480), null);
  assert.equal(targetDimension(480, 640), null);
  assert.equal(targetDimension(320, 240), null);
  assert.equal(targetDimension(MAX_LONG_EDGE, 720), null);
});

test('resizes as soon as the long edge exceeds the box', () => {
  assert.deepEqual(targetDimension(MAX_LONG_EDGE + 1, 720), { width: MAX_LONG_EDGE });
});

test('720p lands in the band the profile asks for', () => {
  const rate = videoBitrateFor(1280, 720, MAX_FPS);
  assert.ok(rate >= 2_500_000 && rate <= 3_500_000, `${rate} outside 2.5–3.5 Mbps`);
});

test('a portrait clip gets the same bitrate as the landscape of equal area', () => {
  assert.equal(videoBitrateFor(720, 1280, MAX_FPS), videoBitrateFor(1280, 720, MAX_FPS));
});

test('a smaller frame gets a smaller bitrate', () => {
  assert.ok(videoBitrateFor(640, 360, MAX_FPS) < videoBitrateFor(1280, 720, MAX_FPS));
});

/* Football is high-motion: the floor is what stops a low-resolution clip being
   encoded into mush, and the ceiling is what stops a square eating the budget. */
test('bitrate stays inside its floor and ceiling', () => {
  assert.equal(videoBitrateFor(160, 120, 15), 1_200_000);
  assert.equal(videoBitrateFor(1080, 1080, MAX_FPS), 3_500_000);
});

test('halving the frame rate halves the bitrate', () => {
  // 720p, where both rates land inside the clamp so the relationship is visible.
  // At smaller frames the 15fps figure hits the floor instead, which is the
  // floor doing its job rather than the formula breaking.
  assert.equal(videoBitrateFor(1280, 720, 30), videoBitrateFor(1280, 720, 15) * 2);
});

test('the floor catches a frame rate low enough to starve the picture', () => {
  assert.equal(videoBitrateFor(854, 480, 15), 1_200_000);
});

test('the size estimate follows duration', () => {
  const ten = estimatedBytes(1280, 720, 30, 10, true);
  const twenty = estimatedBytes(1280, 720, 30, 20, true);
  assert.equal(twenty, ten * 2);
});

test('a silent clip is estimated without the audio track', () => {
  const withAudio = estimatedBytes(1280, 720, 30, 10, true);
  const silent = estimatedBytes(1280, 720, 30, 10, false);
  assert.equal(withAudio - silent, Math.round((AUDIO_BITRATE * 10) / 8));
});

/*
 * The headline claim, stated as arithmetic rather than hope: a 14-second 1080p
 * phone recording at ~40 MB should come back in single-digit megabytes.
 */
test('a 14-second 1080p clip is estimated in single-digit megabytes', () => {
  const bytes = estimatedBytes(1280, 720, 30, 14, true);
  const megabytes = bytes / (1024 * 1024);
  assert.ok(megabytes > 1, `${megabytes.toFixed(1)} MB is implausibly small`);
  assert.ok(megabytes < 10, `${megabytes.toFixed(1)} MB is not a meaningful saving`);
});
