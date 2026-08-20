/**
 * Opening a camera, and swapping to the other one.
 *
 * Pure of React and DI'd on `getUserMedia`, for the same reason as
 * `recorder-ui.ts`: none of this can be exercised in a test that needs a real
 * camera, and every branch here is a failure path that only appears on hardware
 * nobody developing has to hand — a laptop with no rear lens, a phone whose
 * sensor cannot run two cameras at once, a permission the person denied last
 * week. Those are the branches that need testing most.
 *
 * ## The invariant every function here keeps
 *
 * **Never two live cameras, and never zero by accident.** A camera left running
 * is a battery drain and, on a minor's phone, a privacy problem (§11); a camera
 * dropped without a replacement is a viewfinder showing black with no way back.
 * The swap is ordered to make both impossible wherever the hardware allows it.
 */

/** Which way the camera points. The only two values worth switching between. */
export type Facing = 'environment' | 'user';

/** `getUserMedia`, injected so every path below is testable without a camera. */
export type GetUserMedia = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

export function oppositeFacing(facing: Facing): Facing {
  return facing === 'environment' ? 'user' : 'environment';
}

/**
 * A camera that is open, and which way it points.
 *
 * `facing` is `null` when the device does not report one — an ordinary desktop
 * webcam. That is not a failure, it just means there is no front/rear to offer,
 * which is what `offersSwitch` reads it for.
 */
export interface OpenCamera {
  stream: MediaStream;
  facing: Facing | null;
}

/**
 * Opens the rear camera, falling back to the front one.
 *
 * ## Why `exact`, when `exact` is the constraint that throws
 *
 * A plain `facingMode: 'environment'` is an *ideal*: a laptop with one webcam
 * satisfies it by handing back the front camera and reporting success. That
 * would be fine if all we wanted was a picture — but we would then believe we
 * hold the rear camera, mirror the preview wrongly, and point the switch button
 * at a camera we are already using.
 *
 * `{ exact: … }` makes the request fail rather than substitute, so a success is
 * a fact about which camera we hold. The failure is not an error condition: it
 * is the signal to try the other one, which is the fallback the spec asks for and
 * the reason the person never sees a message about it.
 *
 * The third attempt drops `facingMode` entirely, for devices that do not
 * classify their cameras at all. It is last because it is the one whose result
 * we cannot describe.
 */
export async function openCamera(getMedia: GetUserMedia): Promise<OpenCamera | null> {
  const order: Facing[] = ['environment', 'user'];

  for (const facing of order) {
    try {
      const stream = await getMedia({ video: { facingMode: { exact: facing } }, audio: true });
      return { stream, facing: readFacing(stream) ?? facing };
    } catch (error) {
      // A refusal is about the page, not about this camera — the other one is
      // behind the same permission, so trying it just fails again more slowly.
      if (isPermissionDenied(error)) return null;
    }
  }

  try {
    // No camera here classifies itself front or rear. Take whatever there is:
    // recording matters, switching is a convenience on top of it (§9).
    const stream = await getMedia({ video: true, audio: true });
    return { stream, facing: readFacing(stream) };
  } catch {
    return null;
  }
}

/**
 * The result of asking for the other camera.
 *
 * `ok: false` still carries a stream, because the promise this makes to the
 * caller is that a failed switch leaves them no worse off. `stream: null` is the
 * one case where it could not keep that promise and the camera is genuinely gone.
 */
export type SwitchResult =
  | { ok: true; stream: MediaStream; facing: Facing }
  | { ok: false; stream: MediaStream | null; facing: Facing | null };

/**
 * Swaps to the other camera, keeping the microphone and the old camera until the
 * new one is actually in hand.
 *
 * ## Why the new camera is acquired *before* the old one is released
 *
 * The obvious order — stop, then open — has a window in which we hold nothing,
 * and if the second call fails the person is left staring at black. Acquiring
 * first means an outright failure costs nothing: we still hold the working
 * camera, and the switch is simply refused.
 *
 * ## Except on the phones where that cannot work
 *
 * Some devices run one camera at a time and answer `NotReadableError` while the
 * first is open — and those are phones, which is exactly where switching is worth
 * having. So that *one* error, and no other, earns a second attempt with the old
 * camera released first. If that attempt fails too we reopen the camera we
 * started with, which is the only path here that can end with nothing.
 *
 * `OverconstrainedError` deliberately does not take that path: it means the
 * requested camera does not exist, and releasing a working camera cannot conjure
 * one. That distinction is what keeps a laptop from going dark on a tap.
 *
 * ## The microphone is carried across, never re-opened
 *
 * The video is requested on its own and the existing audio track is moved into
 * the new stream. Re-requesting audio would give a second capture of the same
 * microphone, and only stopping the whole old stream afterwards would leave the
 * recording silent. Carrying the track means there is exactly one, throughout.
 */
export async function switchCamera(
  current: MediaStream,
  from: Facing,
  getMedia: GetUserMedia,
): Promise<SwitchResult> {
  const to = oppositeFacing(from);
  const audio = current.getAudioTracks().filter((track) => track.readyState === 'live');
  // Only ask for a microphone if the one we had is gone, or the next recording
  // would be silent. When we do ask, there is no old track to duplicate.
  const wantAudio = audio.length === 0;

  let next: MediaStream;

  try {
    next = await getMedia({ video: { facingMode: { exact: to } }, audio: wantAudio });
  } catch (error) {
    if (!isDeviceBusy(error)) {
      // Denied, absent, or unconstrainable. The camera we hold is untouched and
      // still recording-ready; the caller shows a toast and carries on.
      return { ok: false, stream: current, facing: from };
    }

    // One camera at a time. Let go of the video — and only the video, so the
    // microphone survives — then ask again.
    stopVideo(current);

    try {
      next = await getMedia({ video: { facingMode: { exact: to } }, audio: wantAudio });
    } catch {
      return await restore(current, from, audio, getMedia);
    }
  }

  stopVideo(current);
  return { ok: true, stream: compose(next, audio), facing: to };
}

/**
 * Takes back the camera we let go of.
 *
 * Only reachable from the release-first path above, and the reason that path is
 * gated so narrowly. Failing here is the single way this module ends with no
 * camera at all, which the caller renders as the existing unavailable state
 * rather than as a failed switch.
 */
async function restore(
  current: MediaStream,
  from: Facing,
  audio: MediaStreamTrack[],
  getMedia: GetUserMedia,
): Promise<SwitchResult> {
  try {
    const back = await getMedia({ video: { facingMode: { exact: from } }, audio: false });
    return { ok: false, stream: compose(back, audio), facing: from };
  } catch {
    // Nothing left to hold. Release the microphone too rather than leave a
    // recording indicator lit over a camera that is not running.
    current.getTracks().forEach((track) => track.stop());
    audio.forEach((track) => track.stop());
    return { ok: false, stream: null, facing: null };
  }
}

/**
 * The new video plus the microphone we already had.
 *
 * A fresh `MediaStream` rather than mutating the old one: `MediaRecorder` holds
 * its stream by reference, so mutating in place is the operation that would
 * destroy a recording (see the note in `ClipUploader`). A new object cannot be
 * mistaken for the one anything else is holding.
 */
function compose(next: MediaStream, carriedAudio: MediaStreamTrack[]): MediaStream {
  // If the request brought its own microphone, `carriedAudio` was empty by
  // construction — so these two can never both contribute a track.
  const audio = next.getAudioTracks().length > 0 ? next.getAudioTracks() : carriedAudio;
  return new MediaStream([...next.getVideoTracks(), ...audio]);
}

/** Ends the camera without touching the microphone. */
function stopVideo(stream: MediaStream): void {
  stream.getVideoTracks().forEach((track) => track.stop());
}

/** What the camera says it is, where it says anything at all. */
function readFacing(stream: MediaStream): Facing | null {
  const reported = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
  return reported === 'environment' || reported === 'user' ? reported : null;
}

/**
 * A refusal by the person, not by the hardware.
 *
 * Both cameras sit behind one permission, so there is nothing to fall back to
 * and no reason to spend a second call discovering that.
 */
function isPermissionDenied(error: unknown): boolean {
  const name = errorName(error);
  return name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError';
}

/**
 * The camera exists but cannot be opened *right now* — which on a phone usually
 * means the sensor is already running the other one.
 *
 * The only error that justifies releasing a working camera to retry, because it
 * is the only one that releasing a working camera can fix.
 */
function isDeviceBusy(error: unknown): boolean {
  const name = errorName(error);
  return name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError';
}

function errorName(error: unknown): string {
  return error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
}

/**
 * How many cameras this device has, or `null` if it will not say.
 *
 * Before permission is granted browsers report entries stripped of their labels
 * and ids, but they do report the right *number* — and this is only ever called
 * once a stream is open, so the answer is the full one.
 */
export async function countCameras(
  enumerate: () => Promise<MediaDeviceInfo[]>,
): Promise<number | null> {
  try {
    const devices = await enumerate();
    return devices.filter((device) => device.kind === 'videoinput').length;
  } catch {
    return null;
  }
}

/**
 * Whether to offer the switch at all.
 *
 * Two judgements, both deliberate:
 *
 * - No known facing means no front/rear to switch between — an ordinary webcam.
 *   Offering a button that cannot do anything is worse than not offering one.
 * - An *unknown* count still offers it. `enumerateDevices` failing is not
 *   evidence of a single camera, and a switch that turns out to be impossible
 *   fails into a toast with the camera still running (§8) — a cheap wrong guess,
 *   where hiding the button from a phone that has two cameras is not.
 */
export function offersSwitch(facing: Facing | null, cameraCount: number | null): boolean {
  if (!facing) return false;
  return cameraCount === null || cameraCount >= 2;
}
