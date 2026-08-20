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
  MAX_DURATION_SECONDS,
  MAX_FPS,
  MAX_LONG_EDGE,
  estimatedBytes,
  mustProcess,
  outputSeconds,
  targetDimension,
  videoBitrateFor,
} from './compress';
import type { CompressResult, CompressSkipReason } from './compress.types';

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

/*
 * Duration.
 *
 * A source longer than a minute is trimmed to its first minute, never refused —
 * somebody who filmed two minutes has not made a mistake worth an error, they
 * have filmed the thing plus some walking back.
 */

test('a clip past the cap is shortened to it', () => {
  assert.equal(outputSeconds(155), MAX_DURATION_SECONDS);
  assert.equal(outputSeconds(72), MAX_DURATION_SECONDS);
});

test('a clip inside the cap is left at its own length', () => {
  assert.equal(outputSeconds(45), 45);
  assert.equal(outputSeconds(5), 5);
  assert.equal(outputSeconds(MAX_DURATION_SECONDS), MAX_DURATION_SECONDS);
});

test('a trimmed clip is estimated at the cap, not at its source length', () => {
  const twoAndAHalfMinutes = estimatedBytes(1280, 720, 30, outputSeconds(155), true);
  const oneMinute = estimatedBytes(1280, 720, 30, MAX_DURATION_SECONDS, true);
  assert.equal(twoAndAHalfMinutes, oneMinute);
});

/*
 * ---------------------------------------------------------------------------
 * THE INVARIANT
 *
 *   A source longer than 60 seconds can never reach R2 as the final upload.
 *
 * `mustProcess` is the whole of the enforcement — the uploader refuses unless it
 * returns false — so these cases are the invariant itself rather than a sample
 * of it. Every outcome the compressor can produce appears below, paired with
 * every duration it can carry, and none of the over-length combinations is
 * allowed through.
 * ---------------------------------------------------------------------------
 */

const ALL_SKIP_REASONS: CompressSkipReason[] = [
  'unsupported',
  'cannot-encode',
  'no-video-track',
  'unreadable',
  'already-small',
  'no-saving',
  'cancelled',
  'failed',
];

const skipped = (sourceSeconds: number | null, reason: CompressSkipReason): CompressResult => ({
  status: 'skipped',
  file: new File([], 'clip.mp4'),
  originalBytes: 1,
  bytes: 1,
  reason,
  sourceSeconds,
});

const compressed = (sourceSeconds: number | null, trimmed: boolean): CompressResult => ({
  status: 'compressed',
  file: new File([], 'clip.mp4'),
  originalBytes: 40_000_000,
  bytes: 5_000_000,
  sourceSeconds,
  trimmed,
});

/** 1. A 120s source with WebCodecs available: trimmed, and allowed through. */
test('120s source, encoder available — the trimmed output is uploaded', () => {
  const result = compressed(120, true);
  assert.equal(mustProcess(result), false);
  assert.equal(outputSeconds(120), MAX_DURATION_SECONDS);
});

/** 2. A 120s source with no WebCodecs: the original must not go up. */
test('120s source, no encoder — the upload is blocked', () => {
  assert.equal(mustProcess(skipped(120, 'unsupported')), true);
});

/** 3. Just over the cap is still over it. */
test('61s source is trimmed, and blocked if it could not be', () => {
  assert.equal(outputSeconds(61), MAX_DURATION_SECONDS);
  assert.equal(mustProcess(skipped(61, 'unsupported')), true);
});

/** 4. Exactly at the cap is inside it. */
test('a source of exactly 60s is allowed and untrimmed', () => {
  assert.equal(outputSeconds(MAX_DURATION_SECONDS), MAX_DURATION_SECONDS);
  for (const reason of ALL_SKIP_REASONS) {
    assert.equal(
      mustProcess(skipped(MAX_DURATION_SECONDS, reason)),
      false,
      `60s must never be blocked (${reason})`,
    );
  }
});

/** 5. Comfortably inside the cap. */
test('a 59s source is allowed however compression went', () => {
  for (const reason of ALL_SKIP_REASONS) {
    assert.equal(mustProcess(skipped(59, reason)), false, `59s must never be blocked (${reason})`);
  }
});

/** 6 & 7. Compression or trim failure on an over-length source. */
test('every failure on an over-length source blocks the original', () => {
  for (const reason of ALL_SKIP_REASONS) {
    if (reason === 'cancelled') continue;
    assert.equal(
      mustProcess(skipped(120, reason)),
      true,
      `a 120s source must never upload unchanged (${reason})`,
    );
  }
});

/*
 * The hole this closed.
 *
 * The guard used to require a *known* duration over the cap, so a file whose
 * metadata never resolved — no encoder, unreadable container — fell straight
 * through to uploading the original, at whatever length it happened to be. The
 * rule is "we cannot show it is under the cap", not "we know it is over".
 */
test('an unmeasurable duration is blocked rather than assumed short', () => {
  for (const reason of ALL_SKIP_REASONS) {
    if (reason === 'cancelled') continue;
    assert.equal(
      mustProcess(skipped(null, reason)),
      true,
      `an unknown duration must not upload unchanged (${reason})`,
    );
  }
});

/* Replacing the take is not a failure to report — nobody is uploading that file. */
test('a cancelled encode never blocks, at any duration', () => {
  assert.equal(mustProcess(skipped(120, 'cancelled')), false);
  assert.equal(mustProcess(skipped(null, 'cancelled')), false);
});

/* A conversion that ran has been through the trim, so its length is ours. */
test('a completed conversion is never blocked', () => {
  assert.equal(mustProcess(compressed(120, true)), false);
  assert.equal(mustProcess(compressed(45, false)), false);
  assert.equal(mustProcess(compressed(null, false)), false);
});

/*
 * The exhaustive sweep: every outcome × a spread of durations, asserted against
 * the rule stated independently of the implementation.
 */
test('no over-length source is ever allowed through, across every combination', () => {
  for (const seconds of [null, 0.5, 30, 59, 60, 60.5, 61, 120, 3600]) {
    for (const reason of ALL_SKIP_REASONS) {
      const allowed = !mustProcess(skipped(seconds, reason));
      const provablyWithinCap = seconds !== null && seconds <= MAX_DURATION_SECONDS;
      const replaced = reason === 'cancelled';
      assert.equal(
        allowed,
        provablyWithinCap || replaced,
        `${seconds}s / ${reason} was ${allowed ? 'allowed' : 'blocked'} and should not have been`,
      );
    }
  }
});
