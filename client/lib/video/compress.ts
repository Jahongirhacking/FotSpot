/**
 * Re-encodes a clip in the browser, before it is uploaded.
 *
 * ## Why here and not on the server
 *
 * The whole upload design exists so the video never reaches the API: the browser
 * PUTs it straight to R2 with a presigned URL (§14). Compressing server-side
 * would mean the API downloading 40 MB back out of R2, transcoding it, uploading
 * the result and deleting the original — three times the bandwidth, an FFmpeg
 * binary on a host that has none, and CPU burned in the same single Node process
 * that serves every request.
 *
 * It would also save the wrong person's bandwidth. The expensive half of this is
 * the *upload*, paid for by a fourteen-year-old on prepaid mobile data, and
 * compressing after it has arrived saves them nothing at all.
 *
 * `capturePoster` already established this: the browser holds the bytes, so work
 * done on them there costs no transfer. This is the same argument applied to the
 * video itself.
 *
 * ## Nothing here can cost somebody their upload
 *
 * Every failure path returns the original file. An unsupported browser, a codec
 * the decoder refuses, a device that runs out of memory, a corrupt file — all of
 * them fall back to uploading exactly what the player chose, which is what
 * happened before this existed. The function does not throw.
 */
import type { CompressResult, CompressSkipReason } from './compress.types';

export type { CompressResult, CompressSkipReason };

/**
 * The longest side of the output, in pixels.
 *
 * Only ever the *longest* — the other is deduced from the aspect ratio, which is
 * what keeps a portrait clip portrait. A fixed 1280×720 would letterbox or
 * stretch every phone recording in the feed, and phone recordings are almost all
 * of them.
 *
 * 1280 is chosen against the screen the clip is watched on rather than the one it
 * was filmed on: the feed renders roughly 400 CSS pixels wide on a phone and a
 * little over 700 in the full-screen viewer, so 720p on the short edge is already
 * beyond what any viewer resolves. 1080p is paying to transmit detail the player
 * is never shown.
 */
export const MAX_LONG_EDGE = 1280;

/** Football is high-motion, so frames matter — but 60fps buys nothing here. */
export const MAX_FPS = 30;

/**
 * §21.6 — a clip is a proof, not a highlight reel. One minute is the cap.
 *
 * A longer source is **trimmed to its first minute, not refused**. Somebody who
 * films two minutes has not made a mistake worth an error message; they have
 * filmed the thing plus some walking back, and the product's answer to that is
 * to take the minute rather than hand them a video editor. The same number caps
 * the in-browser recorder, which stops at it rather than trimming afterwards.
 */
export const MAX_DURATION_SECONDS = 60;

/** Speech and pitch noise. Nobody is judging a touch by its soundtrack. */
export const AUDIO_BITRATE = 96_000;

/**
 * Bits per pixel per frame.
 *
 * The one number that decides quality, so it is a number rather than a table: a
 * bitrate that is right for 720p is wrong for 480p by exactly the ratio of their
 * pixel counts, and a table of magic constants hides that relationship.
 *
 * 0.11 is deliberately generous. Football is the hard case for an encoder —
 * grass texture, a fast pan, a ball moving against a crowd — and the usual
 * "small file" advice produces exactly the smeared, blocky footage a scout
 * cannot judge a first touch from. The goal is a dramatically smaller file that
 * still shows technique, not the smallest file that still plays.
 */
const BITS_PER_PIXEL_PER_FRAME = 0.11;

/** The band the spec asks for, and what the formula is clamped into. */
const MIN_VIDEO_BITRATE = 1_200_000;
const MAX_VIDEO_BITRATE = 3_500_000;

/**
 * How much larger than our own target an input may be before it is re-encoded.
 *
 * Re-encoding is lossy, so a file that is already about the size we would produce
 * should be left alone — running it through the encoder again would cost quality
 * and save nothing. The margin is generous for the same reason.
 */
const REENCODE_IF_LARGER_THAN = 1.25;

/** The bitrate for a given output size — see BITS_PER_PIXEL_PER_FRAME. */
export function videoBitrateFor(width: number, height: number, fps: number): number {
  const raw = width * height * fps * BITS_PER_PIXEL_PER_FRAME;
  return Math.round(Math.min(MAX_VIDEO_BITRATE, Math.max(MIN_VIDEO_BITRATE, raw)));
}

/**
 * The output size for an input, preserving the aspect ratio and never upscaling.
 *
 * Returns whichever single dimension needs constraining, because the encoder
 * deduces the other from the aspect ratio — asking for both is how a video ends
 * up stretched or letterboxed. `null` means the clip is already inside the box
 * and its dimensions should be left exactly as they are.
 *
 *   1920×1080 → { width: 1280 }   → 1280×720
 *   1080×1920 → { height: 1280 }  → 720×1280
 *   2160×3840 → { height: 1280 }  → 720×1280
 *   1080×1080 → null              → 1080×1080, untouched
 *    640×480  → null              → never upscaled
 */
export function targetDimension(
  width: number,
  height: number,
): { width: number } | { height: number } | null {
  const longest = Math.max(width, height);
  if (longest <= MAX_LONG_EDGE) return null;
  return width >= height ? { width: MAX_LONG_EDGE } : { height: MAX_LONG_EDGE };
}

/**
 * What the output would weigh, roughly, at our settings.
 *
 * Used only to decide whether re-encoding is worth doing at all — an estimate is
 * the right tool for that, and the encoder's real output depends on motion and
 * scene complexity in ways nothing can predict from metadata.
 */
export function estimatedBytes(
  width: number,
  height: number,
  fps: number,
  seconds: number,
  hasAudio: boolean,
): number {
  const bitsPerSecond = videoBitrateFor(width, height, fps) + (hasAudio ? AUDIO_BITRATE : 0);
  return Math.round((bitsPerSecond * seconds) / 8);
}

/**
 * How long the output will be: the source, or the cap, whichever is shorter.
 */
export function outputSeconds(sourceSeconds: number): number {
  return Math.min(sourceSeconds, MAX_DURATION_SECONDS);
}

/**
 * Reads a file's duration without WebCodecs.
 *
 * A `<video>` element and its metadata, the same technique `capturePoster` uses
 * to find a frame. It works in every browser, including the ones with no encoder
 * at all — which is exactly where it matters, because a browser that cannot trim
 * still must not be allowed to upload an untrimmed two-minute clip.
 *
 * Returns null rather than throwing. An unreadable duration is a container the
 * browser does not recognise far more often than it is a long recording, and
 * refusing on "unknown" would break ordinary uploads to enforce a rule nothing
 * has shown to be broken.
 */
export async function probeDuration(file: File | Blob): Promise<number | null> {
  if (typeof document === 'undefined') return null;

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.src = url;

  try {
    return await new Promise<number | null>((resolve) => {
      const finish = (seconds: number | null) => {
        clearTimeout(timer);
        video.removeAttribute('src');
        video.load();
        resolve(seconds);
      };
      const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);
      video.onerror = () => finish(null);
      video.onloadedmetadata = () =>
        finish(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A file that will not report its duration in this long is one we stop asking. */
const PROBE_TIMEOUT_MS = 8000;

/**
 * True when this clip must be processed before it may be uploaded at all.
 *
 * Only over-length sources qualify. Everything else compression does is an
 * optimisation the upload can proceed without — this is the one rule that is
 * about the stored clip being correct rather than smaller, so a failure here has
 * to stop the upload instead of falling back to the original.
 */
export function mustProcess(result: CompressResult): boolean {
  return (
    result.status === 'skipped' &&
    result.reason !== 'cancelled' &&
    result.sourceSeconds !== null &&
    result.sourceSeconds > MAX_DURATION_SECONDS
  );
}

/**
 * Compresses a clip, or explains why it did not.
 *
 * Loads the encoder lazily: it is a few hundred kilobytes and only a player who
 * is actually uploading needs it, so the feed, search and every other screen pay
 * nothing for it.
 */
export async function compressForFeed(
  file: File,
  options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<CompressResult> {
  /*
   * The duration first, and by the cheapest means available.
   *
   * Before any of the encoder machinery, because the answer decides whether the
   * upload may proceed at all if that machinery turns out to be unavailable —
   * see `mustProcess`. A `<video>` element reads metadata in every browser,
   * including ones with no WebCodecs at all.
   */
  let sourceSeconds = await probeDuration(file);

  const original = { file, originalBytes: file.size };
  const skip = (reason: CompressSkipReason): CompressResult => ({
    ...original,
    status: 'skipped',
    reason,
    bytes: file.size,
    sourceSeconds,
  });

  // Server-rendered, or a browser without the media stack this needs.
  if (typeof window === 'undefined' || typeof VideoEncoder === 'undefined') {
    return skip('unsupported');
  }

  try {
    const {
      ALL_FORMATS,
      BlobSource,
      BufferTarget,
      canEncodeVideo,
      Conversion,
      Input,
      Mp4OutputFormat,
      Output,
      Quality,
    } = await import('mediabunny');

    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return skip('no-video-track');

    const [displayWidth, displayHeight, duration, inputFps] = await Promise.all([
      track.displayWidth,
      track.displayHeight,
      input.computeDuration(),
      track.computePacketStats(120).then((stats) => stats.averagePacketRate ?? MAX_FPS),
    ]);

    if (!displayWidth || !displayHeight || !duration) return skip('unreadable');

    // The demuxer's figure is the better one — it read the container properly,
    // where the probe read whatever the media element chose to report.
    sourceSeconds = duration;
    const needsTrim = duration > MAX_DURATION_SECONDS;

    const target = targetDimension(displayWidth, displayHeight);
    const outWidth = target && 'width' in target ? target.width : displayWidth;
    const outHeight = target && 'height' in target ? target.height : displayHeight;
    const fps = Math.min(MAX_FPS, Math.max(1, Math.round(inputFps)));

    /*
     * Ask the browser before starting.
     *
     * `canEncodeVideo` reports on this device's actual encoder, so a phone whose
     * hardware refuses these dimensions is discovered here rather than several
     * seconds into a conversion that was always going to fail.
     */
    if (
      !(await canEncodeVideo('avc', { width: outWidth, height: outHeight, bitrate: 3_000_000 }))
    ) {
      return skip('cannot-encode');
    }

    /*
     * Already small enough, so leave it alone.
     *
     * Re-encoding an acceptable file is pure loss: H.264 is lossy in both
     * directions, and a clip that is already inside our box and around our
     * target size would come back visibly worse for no saving.
     */
    const audioTrack = await input.getPrimaryAudioTrack();
    const estimate = estimatedBytes(
      outWidth,
      outHeight,
      fps,
      outputSeconds(duration),
      Boolean(audioTrack),
    );
    // `needsTrim` overrides every other reason to leave a file alone: a clip past
    // the cap has to be cut whatever its size or dimensions.
    if (!needsTrim && !target && file.size <= estimate * REENCODE_IF_LARGER_THAN) {
      return skip('already-small');
    }

    const output = new Output({
      // `in-memory` puts the moov atom at the front of the file. Without it a
      // player must fetch the tail before it can start, which on a feed is the
      // difference between a clip that plays and one that spins.
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });

    const conversion = await Conversion.init({
      input,
      output,
      // The first minute, when there is more than a minute. Omitted entirely
      // otherwise, so a short clip is not routed through a trim that would only
      // re-describe its own full length.
      ...(needsTrim ? { trim: { end: MAX_DURATION_SECONDS } } : {}),
      video: {
        codec: 'avc',
        // Exactly one dimension, so the other follows the aspect ratio. Never
        // both: that is what `fit` is for, and every value of `fit` either
        // stretches, crops or letterboxes.
        ...(target ?? {}),
        frameRate: fps,
        quality: new Quality(videoBitrateFor(outWidth, outHeight, fps)),
      },
      audio: audioTrack
        ? { codec: 'aac', bitrate: new Quality(AUDIO_BITRATE) }
        : // A clip filmed on mute is ordinary. Discarding the absent track keeps
          // the output from carrying an empty one some players stumble on.
          { discard: true },
    });

    if (!conversion.isValid) return skip('cannot-encode');

    if (options.onProgress) {
      conversion.onProgress = (fraction) => options.onProgress?.(fraction);
    }
    options.signal?.addEventListener('abort', () => conversion.cancel(), { once: true });

    await conversion.execute();

    const buffer = output.target.buffer;
    if (!buffer) return skip('failed');

    const compressed = new File([buffer], renameToMp4(file.name), { type: 'video/mp4' });

    /*
     * Keep whichever is smaller.
     *
     * An encoder handed footage that is already efficient, or very short, can
     * produce something larger than it started with — and uploading a bigger
     * file to save bandwidth would be the opposite of the point.
     */
    // Never for a trimmed clip: the shorter video is the point, and the original
    // is not a legal substitute for it however the two compare in bytes.
    if (!needsTrim && compressed.size >= file.size) return skip('no-saving');

    return {
      status: 'compressed',
      file: compressed,
      originalBytes: file.size,
      bytes: compressed.size,
      sourceSeconds,
      trimmed: needsTrim,
    };
  } catch (error) {
    // Out of memory on a low-end phone, a codec the decoder will not touch, a
    // truncated file. None of them is a reason to refuse somebody's upload.
    if ((error as Error)?.name === 'AbortError') return skip('cancelled');
    return skip('failed');
  }
}

/** `clip.mov` → `clip.mp4`. The key's extension is minted from this. */
function renameToMp4(name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'clip';
  return `${base}.mp4`;
}
