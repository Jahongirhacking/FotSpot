import { ApiError } from './client';

/**
 * PUTs a file straight to R2 with a presigned URL.
 *
 * ## Why this exists rather than a bare `fetch`
 *
 * A cross-origin PUT that the bucket's CORS policy does not allow does not fail
 * with a status — the browser blocks it and `fetch` rejects with
 * `TypeError: Failed to fetch`, carrying no response at all. Handled as a generic
 * error, that surfaces as "the upload failed, please try again", which is the
 * worst possible advice: retrying can never work, and the person retries anyway
 * because we told them to.
 *
 * R2 buckets have **no CORS policy by default**, so this is the first wall every
 * new deployment hits. Naming it turns a dead end into a one-line fix — see
 * `backend/r2-cors.json`.
 *
 * The distinction is reliable: a rejection means the request never completed
 * (CORS, DNS, offline, blocked); a resolved response with `ok === false` means R2
 * answered and refused, which is a different problem with a different fix.
 */
export async function uploadToStorage(
  uploadUrl: string,
  file: File | Blob,
  messages: { blocked: string; rejected: string },
): Promise<void> {
  let response: Response;

  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
  } catch {
    // No response object at all: the browser refused to send it or the network
    // dropped. On a configured deployment this is CORS every time.
    throw new ApiError(0, messages.blocked);
  }

  if (!response.ok) {
    // R2 answered. An expired signature (403) is the common one — the ticket is
    // good for fifteen minutes and a slow upload on a phone can outlive it.
    throw new ApiError(response.status, messages.rejected);
  }
}
