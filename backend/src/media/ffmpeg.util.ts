/**
 * The ffmpeg invocation that produces a feed clip, and nothing else.
 *
 * Pure and DI-free like `scout-level.util.ts`, so the argument list can be
 * asserted without a database, a queue or a video — which matters here more than
 * usual, because these arguments are the difference between a clip that scouts
 * can judge and one that is stretched, upscaled or three times too large, and
 * none of those failures throws.
 *
 * The same output profile the browser encoder targets (`client/lib/video/
 * compress.ts`). Two implementations of one profile is a real cost, and it is
 * paid deliberately: the browser path saves the *upload*, which is the expensive
 * half for a player on mobile data, and this path is what guarantees the result
 * when the browser cannot. Keeping the numbers in one shape on each side is the
 * best available mitigation — they are named identically and documented against
 * each other.
 */

/** §21.6 — a clip is a proof, not a highlight reel. One minute is the cap. */
export const MAX_DURATION_SECONDS = 60;

/** The long edge of the output. See the client constant of the same name. */
export const MAX_LONG_EDGE = 1280;

export const MAX_FPS = 30;
export const AUDIO_BITRATE_KBPS = 96;

/** Bits per pixel per frame — see the client's note on why this is a formula. */
const BITS_PER_PIXEL_PER_FRAME = 0.11;
const MIN_VIDEO_BITRATE = 1_200_000;
const MAX_VIDEO_BITRATE = 3_500_000;

/**
 * Fit inside the box, preserve the ratio, never upscale, always land on even
 * numbers.
 *
 * Every clause earns its place:
 *
 * - `min(1280,iw)` / `min(1280,ih)` caps the box at the *source* size, which is
 *   what makes upscaling impossible: a 480×854 clip is asked to fit inside
 *   480×854 and comes out untouched.
 * - `force_original_aspect_ratio=decrease` fits the whole frame inside that box
 *   rather than stretching to fill it or cropping to cover it. No letterboxing
 *   either — `decrease` shrinks the frame, it does not pad it.
 * - the second `scale` rounds both sides down to even. H.264 stores colour at
 *   half resolution each way, so an odd side has no whole chroma sample to sit
 *   in, and encoders variously refuse it or leave a green edge column.
 *
 * Verified against ffmpeg 6.1 on real files: 1920×1080 → 1280×720,
 * 1080×1920 → 720×1280, 1080×1080 → unchanged, 480×854 → unchanged.
 */
export const SCALE_FILTER =
  "scale='min(" +
  MAX_LONG_EDGE +
  ",iw)':'min(" +
  MAX_LONG_EDGE +
  ",ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2";

/**
 * The bitrate for an output of this size, matching the client's formula.
 *
 * Falls back to the 720p figure when the source dimensions are unknown — the
 * probe can fail on an odd container, and a clip encoded at the floor because
 * nothing could read its width would look markedly worse than one encoded at the
 * rate its actual size deserves.
 */
export function videoBitrateFor(width?: number, height?: number): number {
  const pixels = width && height ? width * height : MAX_LONG_EDGE * 720;
  const raw = pixels * MAX_FPS * BITS_PER_PIXEL_PER_FRAME;
  return Math.round(Math.min(MAX_VIDEO_BITRATE, Math.max(MIN_VIDEO_BITRATE, raw)));
}

/**
 * The full argument list, in order.
 *
 * `-t` before the filters and after the input, so the trim is applied to the
 * decoded stream rather than by seeking — accurate to the frame, which matters
 * because "the first minute" has to mean the first minute and not the nearest
 * keyframe to it.
 *
 * `-map_metadata -1` strips the source's tags. A phone records GPS coordinates
 * and a device identifier into a video file, and a clip of a child is the last
 * place either belongs (README §11.4) — the browser encoder drops them too, by
 * writing a new container rather than copying one.
 */
export function transcodeArgs(input: string, output: string, source: SourceInfo = {}): string[] {
  const bitrate = videoBitrateFor(source.width, source.height);

  return [
    '-y',
    '-loglevel',
    'error',
    '-i',
    input,
    // The cap, enforced here and not only in the browser: a client that skipped
    // the frontend entirely still cannot produce a longer clip than this.
    '-t',
    String(MAX_DURATION_SECONDS),
    '-vf',
    SCALE_FILTER,
    // A ceiling, not a target — a 24fps source stays 24fps rather than being
    // interpolated up to 30, which would invent frames and cost bitrate.
    '-r',
    String(MAX_FPS),
    '-c:v',
    'libx264',
    // Fast enough that a worker is not tied up for minutes, slow enough that the
    // bitrate buys real detail. `veryfast` is the usual choice for exactly this.
    '-preset',
    'veryfast',
    '-b:v',
    String(bitrate),
    // Room to spend on the hard moments — a fast pan across grass — without the
    // average drifting up. Football is the case that needs it.
    '-maxrate',
    String(Math.round(bitrate * 1.5)),
    '-bufsize',
    String(bitrate * 2),
    '-profile:v',
    'high',
    // 4:2:0, which is what every phone and browser can decode. Without it ffmpeg
    // may keep a 4:4:4 source as-is and produce a file Safari refuses.
    '-pix_fmt',
    'yuv420p',
    '-map_metadata',
    '-1',
    ...(source.hasAudio === false
      ? // Nothing to encode, and asking for an audio stream that does not exist
        // fails the whole run.
        ['-an']
      : ['-c:a', 'aac', '-b:a', `${AUDIO_BITRATE_KBPS}k`, '-ac', '2']),
    // moov at the front, so playback starts without fetching the tail first.
    '-movflags',
    '+faststart',
    output,
  ];
}

export interface SourceInfo {
  width?: number;
  height?: number;
  /** False only when the probe positively found no audio stream. */
  hasAudio?: boolean;
}

/** `ffprobe` arguments for the three facts `transcodeArgs` wants. */
export function probeArgs(input: string): string[] {
  return ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', input];
}

/** Reads `ffprobe -of json` into the shape `transcodeArgs` takes. */
export function parseProbe(json: string): SourceInfo {
  try {
    const streams = (JSON.parse(json)?.streams ?? []) as {
      codec_type?: string;
      width?: number;
      height?: number;
    }[];
    const video = streams.find((stream) => stream.codec_type === 'video');
    return {
      width: video?.width,
      height: video?.height,
      hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
    };
  } catch {
    // An unreadable probe is not a reason to refuse the clip: the transcode
    // falls back to the default bitrate and keeps whatever audio it finds.
    return {};
  }
}
