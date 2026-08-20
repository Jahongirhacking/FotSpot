/**
 * Opening and swapping cameras.
 *
 * Every branch in `camera.ts` is a failure path that only shows itself on
 * hardware that is awkward to have to hand — a laptop with no rear lens, a phone
 * that runs one sensor at a time, a permission denied last week. So the hardware
 * is faked here and the *ordering* is what gets asserted: which constraints were
 * requested, in what order, and which tracks were stopped by the time it
 * finished. Those orderings are the whole correctness argument, because getting
 * one wrong leaves either two cameras running or none.
 *
 * Run with `npx tsx --test lib/video/camera.spec.ts`.
 */
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
  countCameras,
  offersSwitch,
  openCamera,
  oppositeFacing,
  switchCamera,
  type Facing,
  type GetUserMedia,
} from './camera';

/* -------------------------------------------------------------------------- */
/* A camera, faked just far enough                                            */
/* -------------------------------------------------------------------------- */

class FakeTrack {
  readyState: 'live' | 'ended' = 'live';
  constructor(
    readonly kind: 'video' | 'audio',
    readonly facing?: Facing,
  ) {}
  stop() {
    this.readyState = 'ended';
  }
  getSettings() {
    return this.facing ? { facingMode: this.facing } : {};
  }
}

class FakeStream {
  readonly tracks: FakeTrack[];
  constructor(tracks: FakeTrack[]) {
    this.tracks = tracks;
  }
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
}

/* `compose` builds one, so the module needs the constructor in scope. */
(globalThis as { MediaStream?: unknown }).MediaStream = FakeStream;

/**
 * The fake, wearing the real type.
 *
 * The module is typed against the DOM, and a fake that implemented all of
 * `MediaStream` would be a page of `id`, `active` and event handlers that no
 * assertion here reads. The intersection keeps `readyState` reachable on the way
 * out — which is the property every cleanup assertion in this file turns on.
 */
type TestStream = FakeStream & MediaStream;

const asStream = (fake: FakeStream) => fake as unknown as TestStream;

const stream = (facing?: Facing, withAudio = true) =>
  asStream(
    new FakeStream([
      new FakeTrack('video', facing),
      ...(withAudio ? [new FakeTrack('audio')] : []),
    ]),
  );

const domError = (name: string) => Object.assign(new Error(name), { name });

/** Every constraint the code asked for, in order. */
let asked: MediaStreamConstraints[] = [];

/**
 * A device described by which cameras it has.
 *
 * `busyWhileOpen` models the phones that run one sensor at a time: a request
 * succeeds only when nothing else is holding a live camera.
 */
function device(options: {
  has: Facing[];
  reportsFacing?: boolean;
  /** Models a phone whose sensor cannot run two cameras at once. */
  busyWhileOpen?: TestStream | true;
  denied?: boolean;
}): GetUserMedia {
  /* Every camera this fake has handed out, plus any the caller already held —
     without that second half a "busy" device would never look busy, since the
     stream under test was not created here. */
  const handedOut = new Set<TestStream>();
  if (typeof options.busyWhileOpen === 'object') handedOut.add(options.busyWhileOpen);

  const anyCameraLive = () =>
    [...handedOut].some((s) => s.getVideoTracks().some((t) => t.readyState === 'live'));

  return (async (constraints: MediaStreamConstraints) => {
    asked.push(constraints);
    if (options.denied) throw domError('NotAllowedError');

    const video = constraints.video;
    const wanted =
      typeof video === 'object' && video.facingMode && typeof video.facingMode === 'object'
        ? ((video.facingMode as { exact: Facing }).exact ?? null)
        : null;

    if (wanted && !options.has.includes(wanted)) throw domError('OverconstrainedError');
    if (options.busyWhileOpen && anyCameraLive()) throw domError('NotReadableError');

    const facing = options.reportsFacing === false ? undefined : (wanted ?? options.has[0]);
    const made = asStream(
      new FakeStream([
        new FakeTrack('video', facing),
        ...(constraints.audio ? [new FakeTrack('audio')] : []),
      ]),
    );
    handedOut.add(made);
    return made;
  }) as unknown as GetUserMedia;
}

/** The `exact` facing of each request, for asserting the order of attempts. */
const askedFacings = () =>
  asked.map((c) => {
    const video = c.video;
    if (typeof video !== 'object' || !video.facingMode) return 'any';
    return (video.facingMode as { exact: string }).exact;
  });

beforeEach(() => {
  asked = [];
});

/* -------------------------------------------------------------------------- */
/* Opening — acceptance B and C                                               */
/* -------------------------------------------------------------------------- */

test('opens the rear camera by preference', async () => {
  const open = await openCamera(device({ has: ['environment', 'user'] }));

  assert.equal(open?.facing, 'environment');
  assert.deepEqual(askedFacings(), ['environment'], 'the front camera must not be asked for');
});

/** B. A device with no rear camera lands on the front one, with no error. */
test('falls back to the front camera when there is no rear one', async () => {
  const open = await openCamera(device({ has: ['user'] }));

  assert.equal(open?.facing, 'user');
  assert.deepEqual(askedFacings(), ['environment', 'user'], 'rear first, then front');
});

/** C. The fallback is silent — an absent rear camera is not a failure. */
test('the rear-camera fallback produces a working camera, not an error', async () => {
  const open = await openCamera(device({ has: ['user'] }));

  assert.ok(open, 'the recorder must open normally on a front-only device');
  assert.equal(open.stream.getVideoTracks().length, 1);
  assert.equal(open.stream.getAudioTracks().length, 1);
});

/*
 * A webcam that classifies itself as neither. The constrained attempts both
 * fail, and the unconstrained one is what keeps the recorder usable at all.
 */
test('takes an unclassified camera rather than refusing to open', async () => {
  const open = await openCamera(device({ has: [], reportsFacing: false }));

  assert.ok(open);
  assert.equal(open.facing, null, 'an unreported facing is null, never a guess');
  assert.deepEqual(askedFacings(), ['environment', 'user', 'any']);
});

/* A denial is about the page, so trying the other camera only fails again. */
test('a denied permission is not retried against the other camera', async () => {
  const open = await openCamera(device({ has: ['environment', 'user'], denied: true }));

  assert.equal(open, null);
  assert.equal(asked.length, 1, 'one refusal is enough to know both are refused');
});

/* The constraint is what we asked for; the track is what we got. */
test('believes the camera over the constraint when the two differ', async () => {
  const lying: GetUserMedia = (async () => stream('user')) as unknown as GetUserMedia;

  assert.equal((await openCamera(lying))?.facing, 'user');
});

/* -------------------------------------------------------------------------- */
/* Switching — acceptance A                                                   */
/* -------------------------------------------------------------------------- */

test('switches rear to front, and back again', async () => {
  const getMedia = device({ has: ['environment', 'user'] });

  const toFront = await switchCamera(stream('environment'), 'environment', getMedia);
  assert.equal(toFront.ok, true);
  assert.equal(toFront.facing, 'user');

  const toRear = await switchCamera(toFront.stream as TestStream, 'user', getMedia);
  assert.equal(toRear.ok, true);
  assert.equal(toRear.facing, 'environment');
});

/** F. The old camera is released — exactly one stays live. */
test('stops the old camera once the new one is in hand', async () => {
  const current = stream('environment');
  const oldVideo = current.getVideoTracks()[0];

  const result = await switchCamera(
    current,
    'environment',
    device({ has: ['environment', 'user'] }),
  );

  assert.equal(oldVideo.readyState, 'ended', 'the previous camera must not stay running');
  assert.equal(result.stream?.getVideoTracks().length, 1);
  assert.equal(result.stream?.getVideoTracks()[0].readyState, 'live');
});

/** The ordering that makes a failed switch harmless. */
test('acquires the new camera before releasing the old one', async () => {
  const current = stream('environment');
  const oldVideo = current.getVideoTracks()[0];
  let stateWhenAsked: string | undefined;

  const getMedia: GetUserMedia = (async () => {
    stateWhenAsked = oldVideo.readyState;
    return stream('user');
  }) as unknown as GetUserMedia;

  await switchCamera(current, 'environment', getMedia);

  assert.equal(stateWhenAsked, 'live', 'releasing first would risk ending with no camera at all');
});

/* -------------------------------------------------------------------------- */
/* Audio — requirement 7                                                      */
/* -------------------------------------------------------------------------- */

test('carries the microphone across instead of opening a second one', async () => {
  const current = stream('environment');
  const microphone = current.getAudioTracks()[0];

  const result = await switchCamera(
    current,
    'environment',
    device({ has: ['environment', 'user'] }),
  );

  assert.equal(result.stream?.getAudioTracks().length, 1, 'exactly one microphone, never two');
  assert.equal(result.stream?.getAudioTracks()[0], microphone, 'the same track, still live');
  assert.equal(microphone.readyState, 'live');
  assert.equal(asked[0].audio, false, 'asking for audio again is what duplicates it');
});

/* A lost microphone is worth re-opening — the alternative is a silent clip. */
test('re-opens the microphone only when the old one has ended', async () => {
  const current = stream('environment');
  current.getAudioTracks()[0].stop();

  const result = await switchCamera(
    current,
    'environment',
    device({ has: ['environment', 'user'] }),
  );

  assert.equal(asked[0].audio, true);
  assert.equal(result.stream?.getAudioTracks().length, 1);
  assert.equal(result.stream?.getAudioTracks()[0].readyState, 'live');
});

/* -------------------------------------------------------------------------- */
/* Failed switches — acceptance D                                             */
/* -------------------------------------------------------------------------- */

/** D. The camera we hold survives a switch that cannot happen. */
test('keeps the working camera when the other one does not exist', async () => {
  const current = stream('environment');
  const video = current.getVideoTracks()[0];

  const result = await switchCamera(current, 'environment', device({ has: ['environment'] }));

  assert.equal(result.ok, false);
  assert.equal(result.stream, current, 'the caller must be left no worse off');
  assert.equal(video.readyState, 'live', 'a refused switch must not cost the camera');
  assert.equal(result.facing, 'environment');
});

/*
 * The distinction the whole failure path turns on: a camera that is *absent*
 * cannot be reached by letting go of the one that works, so we never do.
 */
test('does not release a working camera over an OverconstrainedError', async () => {
  const current = stream('environment');

  await switchCamera(current, 'environment', device({ has: ['environment'] }));

  assert.equal(asked.length, 1, 'a second attempt would mean the camera was released first');
});

test('a denied switch keeps the current camera', async () => {
  const current = stream('environment');

  const result = await switchCamera(
    current,
    'environment',
    device({ has: ['environment', 'user'], denied: true }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.stream, current);
  assert.equal(current.getVideoTracks()[0].readyState, 'live');
});

/* -------------------------------------------------------------------------- */
/* One sensor at a time — the phones switching exists for                     */
/* -------------------------------------------------------------------------- */

test('releases and retries on a device that runs one camera at a time', async () => {
  const current = stream('environment');
  const microphone = current.getAudioTracks()[0];

  const result = await switchCamera(
    current,
    'environment',
    device({ has: ['environment', 'user'], busyWhileOpen: current }),
  );

  assert.equal(result.ok, true, 'a busy sensor must not defeat the switch');
  assert.equal(result.facing, 'user');
  assert.deepEqual(askedFacings(), ['user', 'user'], 'tried, released, tried again');
  assert.equal(microphone.readyState, 'live', 'releasing the camera must not take the microphone');
});

/*
 * The one path that can end with nothing, and the reason it is gated to a single
 * error: the camera was let go, and the retry failed too.
 */
test('takes the original camera back when the retry fails', async () => {
  const current = stream('environment');
  let attempt = 0;

  const getMedia: GetUserMedia = (async (constraints: MediaStreamConstraints) => {
    asked.push(constraints);
    attempt += 1;
    if (attempt === 1) throw domError('NotReadableError');
    if (attempt === 2) throw domError('NotReadableError');
    return stream('environment', false);
  }) as unknown as GetUserMedia;

  const result = await switchCamera(current, 'environment', getMedia);

  assert.equal(result.ok, false);
  assert.equal(result.facing, 'environment', 'restored to where it started');
  assert.equal(result.stream?.getVideoTracks()[0].readyState, 'live');
  assert.deepEqual(askedFacings(), ['user', 'user', 'environment']);
});

/* The microphone survives the round trip, or the next take would be silent. */
test('the restored camera still has the original microphone', async () => {
  const current = stream('environment');
  const microphone = current.getAudioTracks()[0];
  let attempt = 0;

  const getMedia: GetUserMedia = (async () => {
    attempt += 1;
    if (attempt <= 2) throw domError('NotReadableError');
    return stream('environment', false);
  }) as unknown as GetUserMedia;

  const result = await switchCamera(current, 'environment', getMedia);

  assert.equal(result.stream?.getAudioTracks()[0], microphone);
  assert.equal(microphone.readyState, 'live');
});

/* Nothing left to hold: the caller falls back to the unavailable state, and no
   track is left running behind a viewfinder that is showing black. */
test('reports a lost camera rather than pretending to hold one', async () => {
  const current = stream('environment');
  const microphone = current.getAudioTracks()[0];

  const getMedia: GetUserMedia = (async () => {
    throw domError('NotReadableError');
  }) as unknown as GetUserMedia;

  const result = await switchCamera(current, 'environment', getMedia);

  assert.equal(result.ok, false);
  assert.equal(result.stream, null);
  assert.equal(current.getVideoTracks()[0].readyState, 'ended');
  assert.equal(microphone.readyState, 'ended', 'no microphone left live without a camera');
});

/* -------------------------------------------------------------------------- */
/* Never two cameras — acceptance F                                           */
/* -------------------------------------------------------------------------- */

test('repeated switching leaves exactly one camera live', async () => {
  const getMedia = device({ has: ['environment', 'user'] });
  const opened: TestStream[] = [];

  let current = stream('environment');
  let facing: Facing = 'environment';
  opened.push(current);

  for (let i = 0; i < 6; i += 1) {
    const result = await switchCamera(current, facing, getMedia);
    assert.equal(result.ok, true);
    current = result.stream as TestStream;
    facing = result.facing as Facing;
    opened.push(current);
  }

  const liveCameras = opened
    .flatMap((s) => s.getVideoTracks())
    .filter((track) => track.readyState === 'live');

  assert.equal(liveCameras.length, 1, `six switches left ${liveCameras.length} cameras running`);
  assert.equal(facing, 'environment', 'six switches from rear returns to rear');
});

/* Every switch hands back a stream nothing else is holding — mutating one in
   place is what destroys a running recording. */
test('a switch returns a new stream rather than mutating the old one', async () => {
  const current = stream('environment');

  const result = await switchCamera(
    current,
    'environment',
    device({ has: ['environment', 'user'] }),
  );

  assert.notEqual(result.stream, current);
  assert.equal(
    current.getTracks().length,
    2,
    'the old stream is left untouched, only its track ends',
  );
});

/* -------------------------------------------------------------------------- */
/* Offering the switch at all — requirement 9                                 */
/* -------------------------------------------------------------------------- */

test('counts the cameras, and survives a device list it cannot read', async () => {
  const list = (kinds: string[]) => async () => kinds.map((kind) => ({ kind }) as MediaDeviceInfo);

  assert.equal(await countCameras(list(['videoinput', 'videoinput', 'audioinput'])), 2);
  assert.equal(await countCameras(list(['videoinput', 'audioinput'])), 1);
  assert.equal(
    await countCameras(async () => {
      throw new Error('no');
    }),
    null,
  );
});

test('offers the switch only where there is something to switch to', () => {
  assert.equal(offersSwitch('environment', 2), true);
  assert.equal(offersSwitch('user', 3), true);

  /* One camera: the button would have nothing to do. */
  assert.equal(offersSwitch('environment', 1), false);

  /* A webcam that reports no facing has no front/rear to offer. */
  assert.equal(offersSwitch(null, 2), false);
  assert.equal(offersSwitch(null, null), false);
});

/*
 * An unreadable device list is not evidence of one camera. Guessing wrong here
 * costs a toast; guessing wrong the other way hides the feature from a phone.
 */
test('offers the switch when the device list could not be read', () => {
  assert.equal(offersSwitch('environment', null), true);
});

test('oppositeFacing is its own inverse', () => {
  assert.equal(oppositeFacing('environment'), 'user');
  assert.equal(oppositeFacing('user'), 'environment');
  assert.equal(oppositeFacing(oppositeFacing('user')), 'user');
});
