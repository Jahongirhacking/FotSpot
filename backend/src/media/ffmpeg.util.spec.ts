import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MAX_DURATION_SECONDS,
  MAX_FPS,
  MAX_LONG_EDGE,
  parseProbe,
  probeArgs,
  transcodeArgs,
  videoBitrateFor,
} from './ffmpeg.util';

/**
 * The server-side half of the video pipeline.
 *
 * Two kinds of test here, and the second kind is the point. The argument list is
 * asserted directly, which catches a flag that went missing. But an ffmpeg
 * argument list is only correct in terms of what ffmpeg *does* with it — a scale
 * filter can be perfectly well-formed and still stretch every portrait clip — so
 * where ffmpeg is installed these arguments are actually run against generated
 * videos and the output measured.
 *
 * The running half skips itself where ffmpeg is absent, so CI without it still
 * passes on the arguments alone.
 */

const ffmpegAvailable = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('transcodeArgs — the output profile', () => {
  const args = transcodeArgs('in.mp4', 'out.mp4', { width: 1920, height: 1080, hasAudio: true });
  const valueAfter = (flag: string) => args[args.indexOf(flag) + 1];

  it('caps the duration, so a client that skipped the browser cannot exceed it', () => {
    expect(valueAfter('-t')).toBe(String(MAX_DURATION_SECONDS));
  });

  it('encodes H.264 into a faststart MP4', () => {
    expect(valueAfter('-c:v')).toBe('libx264');
    expect(valueAfter('-movflags')).toBe('+faststart');
    expect(valueAfter('-profile:v')).toBe('high');
  });

  it('caps the frame rate', () => {
    expect(valueAfter('-r')).toBe(String(MAX_FPS));
  });

  it('encodes AAC at the agreed bitrate when there is audio', () => {
    expect(valueAfter('-c:a')).toBe('aac');
    expect(valueAfter('-b:a')).toBe('96k');
  });

  /* Asking for an audio stream that does not exist fails the whole run. */
  it('disables audio when the source has none', () => {
    const silent = transcodeArgs('in.mp4', 'out.mp4', { hasAudio: false });
    expect(silent).toContain('-an');
    expect(silent).not.toContain('-c:a');
  });

  /* 4:2:0, or Safari refuses a 4:4:4 source that ffmpeg passed through. */
  it('forces a pixel format every phone can decode', () => {
    expect(valueAfter('-pix_fmt')).toBe('yuv420p');
  });

  /* A phone writes GPS and a device id into a video file; a clip of a child is
     the last place either belongs (§11.4). */
  it('strips the source metadata', () => {
    expect(valueAfter('-map_metadata')).toBe('-1');
  });

  it('never invokes a shell — every argument is its own array element', () => {
    for (const arg of transcodeArgs('a b.mp4', 'c d.mp4')) {
      expect(typeof arg).toBe('string');
    }
    expect(transcodeArgs('a b.mp4', 'c d.mp4')).toContain('a b.mp4');
  });
});

describe('videoBitrateFor', () => {
  it('lands 720p in the band the profile asks for', () => {
    const rate = videoBitrateFor(1280, 720);
    expect(rate).toBeGreaterThanOrEqual(2_500_000);
    expect(rate).toBeLessThanOrEqual(3_500_000);
  });

  it('gives a portrait clip the same rate as the landscape of equal area', () => {
    expect(videoBitrateFor(720, 1280)).toBe(videoBitrateFor(1280, 720));
  });

  /* An unreadable probe should not encode a 1080p clip at the floor. */
  it('falls back to the 720p rate when the size is unknown', () => {
    expect(videoBitrateFor()).toBe(videoBitrateFor(MAX_LONG_EDGE, 720));
  });

  it('clamps at both ends', () => {
    expect(videoBitrateFor(64, 64)).toBe(1_200_000);
    expect(videoBitrateFor(4000, 4000)).toBe(3_500_000);
  });
});

describe('parseProbe', () => {
  it('reads the video size and the presence of audio', () => {
    const json = JSON.stringify({
      streams: [{ codec_type: 'video', width: 1920, height: 1080 }, { codec_type: 'audio' }],
    });
    expect(parseProbe(json)).toEqual({ width: 1920, height: 1080, hasAudio: true });
  });

  it('reports no audio when the file has none', () => {
    const json = JSON.stringify({ streams: [{ codec_type: 'video', width: 640, height: 480 }] });
    expect(parseProbe(json).hasAudio).toBe(false);
  });

  /* An unreadable probe is not a reason to refuse the clip — the arguments have
     defaults for everything it would have supplied. */
  it('survives output it cannot parse', () => {
    expect(parseProbe('not json')).toEqual({});
    expect(parseProbe('')).toEqual({});
  });

  it('asks ffprobe for exactly what the arguments need', () => {
    const args = probeArgs('clip.mp4');
    expect(args).toContain('stream=codec_type,width,height');
    expect(args).toContain('clip.mp4');
  });
});

/**
 * The arguments, actually run.
 *
 * A scale filter is only correct in terms of what ffmpeg does with it, so these
 * generate real videos, transcode them with the real argument list and measure
 * the result. Every geometry in the spec appears, plus the two failure shapes
 * that matter: an over-long source and a source smaller than the box.
 */
(ffmpegAvailable ? describe : describe.skip)('transcodeArgs — run against real ffmpeg', () => {
  let dir: string;

  const source = (name: string, size: string, seconds: number, audio: boolean) => {
    const path = join(dir, `${name}.mp4`);
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=${size}:rate=30:duration=${seconds}`,
      ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`] : []),
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '12',
      '-pix_fmt',
      'yuv420p',
      ...(audio ? ['-c:a', 'aac', '-shortest'] : []),
      path,
    ]);
    return path;
  };

  const dimensions = (path: string) =>
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=p=0',
      path,
    ])
      .toString()
      .trim()
      .replace(/,$/, '');

  const duration = (path: string) =>
    Number(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        path,
      ]).toString(),
    );

  const transcode = (input: string, hasAudio = true) => {
    const output = join(dir, `out-${Math.random().toString(36).slice(2)}.mp4`);
    const [w, h] = dimensions(input).split(',').map(Number);
    execFileSync('ffmpeg', transcodeArgs(input, output, { width: w, height: h, hasAudio }));
    return output;
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'fotspot-ffmpeg-spec-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it.each([
    ['1920x1080', '1280,720'],
    ['1080x1920', '720,1280'],
    ['2560x1440', '1280,720'],
    ['1440x2560', '720,1280'],
  ])('resizes %s to %s, preserving the aspect ratio', (size, expected) => {
    expect(dimensions(transcode(source(`s${size}`, size, 3, true)))).toBe(expected);
  });

  it('leaves a square inside the box exactly as it is', () => {
    expect(dimensions(transcode(source('square', '1080x1080', 3, true)))).toBe('1080,1080');
  });

  /* Upscaling invents detail that was never filmed and costs bitrate to carry. */
  it('never upscales a clip smaller than the box', () => {
    expect(dimensions(transcode(source('small', '480x854', 3, true)))).toBe('480,854');
  });

  it('trims a source past the cap to exactly the cap', () => {
    const out = transcode(source('long', '1280x720', 75, false), false);
    expect(duration(out)).toBeLessThanOrEqual(MAX_DURATION_SECONDS + 0.5);
    expect(duration(out)).toBeGreaterThan(MAX_DURATION_SECONDS - 1);
  });

  it('leaves a short clip at its own length', () => {
    const out = transcode(source('short', '1280x720', 5, true));
    expect(duration(out)).toBeLessThan(6);
  });

  it('handles a source with no audio at all', () => {
    expect(() => transcode(source('silent', '1280x720', 3, false), false)).not.toThrow();
  });

  /* The headline: a 1080p source comes back dramatically smaller. */
  it('produces a dramatically smaller file from 1080p', () => {
    const input = source('big', '1920x1080', 8, true);
    const output = transcode(input);
    const before = statSync(input).size;
    const after = statSync(output).size;
    expect(after).toBeLessThan(before / 2);
  });

  /* moov before mdat, or a player must fetch the tail before it can start. */
  it('writes the index at the front of the file', () => {
    const out = transcode(source('faststart', '1280x720', 3, true));
    const head = execFileSync('head', ['-c', '200000', out]);
    const moov = head.indexOf(Buffer.from('moov'));
    const mdat = head.indexOf(Buffer.from('mdat'));
    expect(moov).toBeGreaterThanOrEqual(0);
    expect(moov).toBeLessThan(mdat);
  });

  it('always produces even dimensions', () => {
    const out = transcode(source('odd', '1001x999', 3, false), false);
    const [w, h] = dimensions(out).split(',').map(Number);
    expect(w % 2).toBe(0);
    expect(h % 2).toBe(0);
  });
});
