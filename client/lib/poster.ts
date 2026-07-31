/** Long edge of the captured cover. A grid tile is ~300px on the densest phone. */
const MAX_EDGE = 640;
const JPEG_QUALITY = 0.72;
/** A file that will not produce a frame in this long is one we stop waiting for. */
const TIMEOUT_MS = 8000;

/**
 * Grabs a still frame from a video file, in the browser.
 *
 * ## Why the browser and not the server
 *
 * The alternative is ffmpeg on the API, which means the video has to reach the
 * API — and the whole upload design exists so it never does (§14). The browser
 * already holds the bytes, so the frame costs one canvas draw and no transfer.
 *
 * ## Why a frame at all
 *
 * The grid shows a dozen tiles. Rendering their first frames by mounting a dozen
 * `<video>` elements would download a dozen videos to show a dozen thumbnails,
 * which on mobile data costs more than the rest of the app put together.
 *
 * Seeks a little way in rather than to zero: the first frame of a phone recording
 * is very often black or a blurred pan, which makes every tile look broken.
 *
 * Returns null instead of throwing. Capture fails for ordinary reasons — a codec
 * the browser will not decode, an unseekable stream, a tainted canvas — and none
 * of them are a good reason to refuse someone's upload. A clip without a cover
 * renders a themed placeholder.
 */
export async function capturePoster(file: File | Blob): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = url;

  try {
    return await new Promise<Blob | null>((resolve) => {
      const finish = (result: Blob | null) => {
        clearTimeout(timer);
        video.removeAttribute('src');
        video.load();
        resolve(result);
      };

      const timer = setTimeout(() => finish(null), TIMEOUT_MS);

      video.onerror = () => finish(null);

      video.onloadeddata = () => {
        // A tenth of the way in, capped — far enough past the black opening
        // frame, near enough that a long clip does not wait on a distant seek.
        const target = Number.isFinite(video.duration)
          ? Math.min(video.duration * 0.1, 1.5)
          : 0;
        if (target > 0) {
          video.currentTime = target;
        } else {
          draw();
        }
      };

      video.onseeked = draw;

      function draw() {
        const { videoWidth: width, videoHeight: height } = video;
        if (!width || !height) return finish(null);

        const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);

        const context = canvas.getContext('2d');
        if (!context) return finish(null);

        try {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => finish(blob), 'image/jpeg', JPEG_QUALITY);
        } catch {
          // Tainted canvas, or a decoder that refuses to hand over pixels.
          finish(null);
        }
      }
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
