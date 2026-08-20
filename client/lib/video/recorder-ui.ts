/**
 * The two decisions the full-screen recorder makes about what it shows.
 *
 * Pure and DI-free so both can be checked without a camera — which matters
 * because neither fails loudly. A drifting timer still counts, and a badly
 * cropped preview still records; the person only finds out afterwards, watching
 * back a clip framed differently from the one they thought they were shooting.
 */

/** `00:14`. Zero-padded so the digits do not jump width as the seconds tick. */
export function formatTimer(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/**
 * How far the two aspect ratios may differ before cropping hides something.
 *
 * 1.15 is a little over a tenth of the frame off one axis — enough to absorb the
 * ordinary mismatch between a 16:9 sensor and a tall phone screen without
 * letterboxing every recording, and tight enough that a landscape camera on a
 * portrait screen (a ratio near 3) never quietly cuts the ball out of shot.
 */
const CROP_TOLERANCE = 1.15;

/**
 * `cover` or `contain` for the live preview.
 *
 * ## Why this is not simply `cover`
 *
 * `cover` is the immersive choice and the one a shorts camera uses, so it is the
 * default here. But a preview is not decoration — it is the viewfinder, and the
 * recording keeps the *camera's* full frame however the preview is displayed. So
 * a landscape stream shown `cover` on a portrait screen hides most of the width
 * from the person composing the shot, and they frame a clip whose edges they
 * never saw. For a football clip that is the ball leaving frame.
 *
 * So: `cover` while the two are close enough that the crop is a trim, `contain`
 * once it would start removing content the person is relying on. Never `fill`,
 * which is the one that stretches.
 */
export function previewFit(
  cameraAspect: number | null | undefined,
  viewportAspect: number | null | undefined,
): 'cover' | 'contain' {
  // Nothing measured yet — `cover` is the better guess while metadata loads,
  // since most recordings are shot in the orientation the phone is held in.
  if (!cameraAspect || !viewportAspect || cameraAspect <= 0 || viewportAspect <= 0) {
    return 'cover';
  }

  const divergence = Math.max(cameraAspect / viewportAspect, viewportAspect / cameraAspect);
  return divergence > CROP_TOLERANCE ? 'contain' : 'cover';
}
