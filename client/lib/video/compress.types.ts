/**
 * The shapes `compressForFeed` returns, in their own file.
 *
 * Separate so a caller can type against the outcome without pulling in the
 * module that lazily imports the encoder — importing the types must not drag a
 * few hundred kilobytes of media code into a bundle that never encodes anything.
 */

/** Why a clip was uploaded as-is. None of these is an error the player sees. */
export type CompressSkipReason =
  /** No WebCodecs, or a browser without an H.264 encoder. */
  | 'unsupported'
  /** This device's encoder refused these dimensions. */
  | 'cannot-encode'
  /** Not a video, or no video track in it. */
  | 'no-video-track'
  /** Metadata would not parse — truncated or corrupt. */
  | 'unreadable'
  /** Already inside the target box and around the target size. */
  | 'already-small'
  /** Re-encoding made it bigger, so the original is kept. */
  | 'no-saving'
  /** The player replaced or cancelled the clip mid-encode. */
  | 'cancelled'
  /** Anything else — out of memory, a decoder throwing, a broken frame. */
  | 'failed';

/**
 * `null` when the file carried no readable duration.
 *
 * Unknown is not the same as over the cap: a clip whose metadata will not parse
 * is far more likely to be an unusual container than a three-minute recording,
 * and refusing it would break ordinary uploads to enforce a rule we cannot show
 * has been broken.
 */
type SourceSeconds = number | null;

export type CompressResult =
  | {
      status: 'compressed';
      file: File;
      originalBytes: number;
      bytes: number;
      sourceSeconds: SourceSeconds;
      /** True when the source ran past the cap and the output stops at it. */
      trimmed: boolean;
    }
  | {
      status: 'skipped';
      file: File;
      originalBytes: number;
      bytes: number;
      reason: CompressSkipReason;
      sourceSeconds: SourceSeconds;
    };
