/**
 * Single fetch boundary for the NestJS API (client/CLAUDE.md §6).
 *
 * Every call goes through here so that the versioned prefix, the Authorization
 * header and error normalisation exist in exactly one place. Components never call
 * `fetch('/api/v1/...')` directly.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

/**
 * What a rejected request can look like.
 *
 * The global HttpExceptionFilter nests the real message under `error.message`,
 * but the same text also arrives flat — Nest's own exceptions before the filter
 * runs, and this app's Next route handlers, both answer `{ message, error,
 * statusCode }`. Reading only one shape is how "Player age (20) is outside the
 * trial's age range (13-16)" became "That didn't work. Please try again."
 *
 * `message` is an array when class-validator rejects a DTO — one entry per field.
 */
interface BackendError {
  statusCode?: number;
  message?: string | string[];
  error?: { message?: string | string[]; error?: string } | string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }
}

/**
 * The server's own words, wherever it put them.
 *
 * Exported because the browser boundary needs the identical answer: two copies of
 * this drifted apart once already, and the client-side one only ever read the flat
 * shape, so every message the API wrote for a user was replaced by a shrug.
 */
export function extractMessage(status: number, body: unknown): string {
  const parsed = body as BackendError | undefined;
  const nested = typeof parsed?.error === 'object' ? parsed.error : undefined;

  for (const candidate of [nested?.message, parsed?.message]) {
    if (Array.isArray(candidate) && candidate.length) return candidate.join(', ');
    if (typeof candidate === 'string' && candidate) return candidate;
  }

  // `error` is the HTTP reason phrase ("Bad Request") — worse than nothing on its
  // own, but better than a generic when it is all the server sent.
  if (typeof nested?.error === 'string' && nested.error) return nested.error;

  // Deliberately generic fallbacks — never surface a raw status code to a 13-year-old.
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "We couldn't find that.";
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  return "That didn't work. Please check your details and try again.";
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Bearer token. On the server, pass the value read from the session cookie. */
  token?: string;
  /**
   * The role the caller is acting as. Sent as `x-active-role`, which narrows the
   * backend's authorization to that one role — it can only ever remove privilege
   * (see JwtStrategy.validate). Browser calls get this from the proxy route; a
   * Server Component read must pass it explicitly.
   */
  activeRole?: string | null;
  /** Next.js fetch caching — only meaningful in Server Components. */
  revalidate?: number | false;
  tags?: string[];
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, token, activeRole, revalidate, tags, headers, ...rest } = options;

  console.log(`[AUTH] api url: ${API_BASE}${path}`, rest?.method);

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(activeRole ? { 'x-active-role': activeRole } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(revalidate !== undefined || tags
      ? { next: { ...(revalidate !== undefined ? { revalidate } : {}), ...(tags ? { tags } : {}) } }
      : {}),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const parsed = text ? tryJson(text) : { ok: true as const, value: undefined };

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractMessage(response.status, parsed.ok ? parsed.value : undefined),
      parsed.ok ? parsed.value : text,
    );
  }

  // A 2xx that isn't JSON is still a failure from the caller's point of view, and
  // must throw rather than return a string typed as T. Otherwise a misconfigured
  // NEXT_PUBLIC_API_URL, a proxy's HTML error page, or a maintenance page all reach
  // components as `undefined.items` and crash the render — and none of the
  // `.catch()` fallbacks at the call sites would fire, because the promise resolved.
  if (!parsed.ok) {
    throw new ApiError(
      response.status,
      'The server returned an unexpected response. Check that the API is running and NEXT_PUBLIC_API_URL points at it.',
      text.slice(0, 200),
    );
  }

  return parsed.value as T;
}

type JsonResult = { ok: true; value: unknown } | { ok: false };

function tryJson(text: string): JsonResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Paginated envelope returned by the backend's list endpoints. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
