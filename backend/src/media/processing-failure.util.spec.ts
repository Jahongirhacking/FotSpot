import {
  isStalledError,
  isTimeoutError,
  processingFailureLine,
  withTimeout,
} from './processing-failure.util';

describe('processingFailureLine — one greppable line per failure', () => {
  it('carries the media, the player, the step, the error, the count and the time', () => {
    const line = processingFailureLine({
      mediaId: 'clip-1',
      playerId: 'player-1',
      step: 'transcode-clip',
      error: 'ffmpeg exited 1: moov atom not found',
      attempt: 2,
      attempts: 2,
      final: true,
      at: new Date('2026-09-04T06:22:37.997Z'),
    });

    expect(line).toContain('[MEDIA_PROCESSING_FAILED]');
    expect(line).toContain('mediaId=clip-1');
    expect(line).toContain('playerId=player-1');
    expect(line).toContain('step=transcode-clip');
    expect(line).toContain('attempt=2/2');
    expect(line).toContain('final=true');
    expect(line).toContain('error="ffmpeg exited 1: moov atom not found"');
    expect(line).toContain('at=2026-09-04T06:22:37.997Z');
  });

  it('says so when the player is not known, rather than printing undefined', () => {
    const line = processingFailureLine({ mediaId: 'clip-1', step: 'finalise', error: 'x' });
    expect(line).toContain('playerId=unknown');
    expect(line).not.toContain('undefined');
  });
});

describe('withTimeout — a hung step fails the attempt', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('rejects, naming the step, once the deadline passes', async () => {
    const hung = new Promise<never>(() => undefined);
    const outcome = withTimeout(hung, 5_000, 'finalise');
    const settled = expect(outcome).rejects.toThrow('finalise timed out after 5000ms');

    jest.advanceTimersByTime(5_000);
    await settled;
  });

  it('resolves with the work when it finishes first', async () => {
    await expect(withTimeout(Promise.resolve('ACTIVE'), 5_000, 'finalise')).resolves.toBe('ACTIVE');
  });
});

describe('recognising what BullMQ says', () => {
  it('knows a stalled job from its message', () => {
    expect(isStalledError(new Error('job stalled more than allowable limit'))).toBe(true);
    expect(isStalledError(new Error('The uploaded file has not arrived'))).toBe(false);
    expect(isStalledError(undefined)).toBe(false);
  });

  it('knows a timed-out step', () => {
    expect(isTimeoutError(new Error('transcode timed out after 600000ms'))).toBe(true);
    expect(isTimeoutError(new Error('ffmpeg exited 1'))).toBe(false);
  });
});
