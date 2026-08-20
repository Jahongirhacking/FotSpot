import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { parseProbe, probeArgs, transcodeArgs, type SourceInfo } from './ffmpeg.util';

/**
 * How long one clip may occupy ffmpeg before it is killed.
 *
 * A minute of 1080p at `veryfast` is seconds of work, so anything approaching
 * this is a file ffmpeg cannot make progress on rather than a slow one. Without
 * a bound, a malformed container can hold a worker slot open indefinitely.
 */
const TRANSCODE_TIMEOUT_MS = 4 * 60 * 1000;

/** Whether the binaries exist, resolved once and reused. */
let ffmpegAvailable: boolean | null = null;

/**
 * Turns an uploaded original into the clip the feed will serve.
 *
 * ## Why this exists at all
 *
 * The browser compresses before uploading, which is the right place for it —
 * it saves the player's own upload, which is the expensive half on mobile data.
 * But it cannot be the *only* place: a browser without WebCodecs, a device whose
 * encoder refuses the geometry, an out-of-memory phone. Before this, all of
 * those uploaded the original and the original became the feed video.
 *
 * So this is the guarantee behind the optimisation. Every clip is optimised —
 * by the browser where it can be, by ffmpeg here where it cannot.
 *
 * ## In place, not into a second key
 *
 * The optimised file is written over the same object the client uploaded. The
 * alternative — a temporary key, a final key, and a delete — introduces a second
 * name for one clip, a window in which both exist, and an orphan whenever the
 * delete fails. Overwriting reaches the same end state (only the optimised bytes
 * remain) with none of that, and it means the row, the poster beside it and any
 * signed URL already minted keep pointing at the right thing.
 *
 * The original is never *served* as the feed video regardless of where it lives:
 * a clip is only ever shown once `status = ACTIVE`, and nothing promotes a clip
 * to ACTIVE until this has run. A failure here leaves it FAILED, never ACTIVE.
 */
@Injectable()
export class VideoTranscoderService {
  private readonly logger = new Logger(VideoTranscoderService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private config: ConfigService,
  ) {}

  /** The binary's name, so a deployment can point at a bundled build. */
  private get ffmpegPath(): string {
    return (this.config.get<string>('FFMPEG_PATH') ?? '').trim() || 'ffmpeg';
  }

  private get ffprobePath(): string {
    return (this.config.get<string>('FFPROBE_PATH') ?? '').trim() || 'ffprobe';
  }

  /**
   * Whether this host can transcode at all.
   *
   * Asked once and cached: the answer cannot change while the process runs, and
   * spawning a probe per clip to re-learn it would be wasteful. Deliberately not
   * a constructor check — a boot that fails because ffmpeg is missing would take
   * down an API whose other ninety endpoints do not need it.
   */
  async isAvailable(): Promise<boolean> {
    if (ffmpegAvailable !== null) return ffmpegAvailable;
    try {
      await this.run(this.ffmpegPath, ['-version'], 10_000);
      ffmpegAvailable = true;
    } catch {
      this.logger.error(
        'ffmpeg is not available on this host, so clips uploaded by a browser that ' +
          'cannot compress cannot be optimised and will not be published. Install ' +
          'ffmpeg or set FFMPEG_PATH — see backend/Dockerfile.',
      );
      ffmpegAvailable = false;
    }
    return ffmpegAvailable;
  }

  /**
   * Downloads, transcodes, and writes the result back over the same key.
   *
   * Returns whether the clip is now optimised. `false` means the caller must not
   * promote it — see `MediaFinaliserService`, which refuses to make a clip ACTIVE
   * while it is still the original.
   */
  async transcodeInPlace(mediaId: string, storageKey: string): Promise<boolean> {
    if (!(await this.isAvailable())) {
      await this.fail(mediaId, 'Video processing is unavailable on the server.');
      return false;
    }

    const directory = await mkdtemp(join(tmpdir(), 'fotspot-clip-'));
    const input = join(directory, 'source');
    const output = join(directory, 'optimised.mp4');

    try {
      const original = await this.storage.getObject(storageKey);
      await writeFile(input, original);

      const source = await this.probe(input);
      await this.run(this.ffmpegPath, transcodeArgs(input, output, source), TRANSCODE_TIMEOUT_MS);

      const optimised = await readFile(output);
      if (optimised.length === 0) throw new Error('ffmpeg produced an empty file');

      /*
       * Keep the original when the transcode did not help.
       *
       * Rare but real: a clip already small, already 720p and already H.264 can
       * come back larger. Overwriting it would spend bandwidth to make the feed
       * worse. The clip is optimised *enough* either way, which is what the
       * return value means — not "we re-encoded it" but "this is fit to publish".
       */
      if (optimised.length >= original.length) {
        this.logger.log(
          `[TRANSCODE] ${mediaId}: re-encode was no smaller ` +
            `(${bytes(original.length)} → ${bytes(optimised.length)}), keeping the original.`,
        );
        return true;
      }

      await this.storage.putObject(storageKey, optimised, 'video/mp4');
      this.logger.log(
        `[TRANSCODE] ${mediaId}: ${bytes(original.length)} → ${bytes(optimised.length)}`,
      );
      return true;
    } catch (error) {
      this.logger.error(`[TRANSCODE] ${mediaId} failed: ${(error as Error).message}`);
      await this.fail(mediaId, 'We could not process this video. Please try uploading it again.');
      return false;
    } finally {
      // The source of a minute of 1080p is not something to leave on a worker's
      // disk, whichever way the run went.
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Dimensions and whether there is audio, for the encoder's arguments. */
  private async probe(input: string): Promise<SourceInfo> {
    try {
      const { stdout } = await this.run(this.ffprobePath, probeArgs(input), 30_000);
      return parseProbe(stdout);
    } catch {
      // Not fatal — `transcodeArgs` has defaults for everything it asks for.
      return {};
    }
  }

  /**
   * Marks the clip failed, in words the uploader can act on.
   *
   * `updateMany` filtered on PROCESSING for the same reason `MediaFinaliserService
   * .fail` uses it: a verdict must never overwrite a later one, and by the time a
   * slow transcode finishes the player may already have deleted the clip.
   */
  private async fail(mediaId: string, reason: string): Promise<void> {
    await this.prisma.media
      .updateMany({
        where: { id: mediaId, status: 'PROCESSING' },
        data: { status: 'FAILED', failureReason: reason, processedAt: new Date() },
      })
      .catch((error: Error) =>
        this.logger.error(`Could not mark ${mediaId} failed: ${error.message}`),
      );
  }

  /**
   * Spawns a binary and resolves with its output, or rejects with its complaint.
   *
   * `spawn` with an argument array, never a shell string: a storage key reaches
   * this from a filename the client chose, and a shell would let a crafted one
   * run commands. The arguments here are temporary paths this service made, so
   * the risk is already low — but "already low" is not the standard for handing
   * user-derived data to a subprocess.
   */
  private run(
    command: string,
    args: string[],
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`${command} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (chunk) => (stdout += chunk));
      // Bounded: ffmpeg can be talkative, and an unbounded string here would be
      // a memory leak driven by whatever the input file makes it complain about.
      child.stderr.on('data', (chunk) => {
        if (stderr.length < 4000) stderr += chunk;
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 500)}`));
      });
    });
  }
}

const bytes = (value: number) => `${(value / (1024 * 1024)).toFixed(1)} MB`;
