import { Logger } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Placeholder values shipped in `.env.example`.
 *
 * They exist so the project boots on a fresh clone. Reaching production with one
 * still in place means every access token the platform has ever issued can be
 * forged by anybody who has read the repository — which is everybody.
 */
const PLACEHOLDER_SECRETS = ['change-me-access', 'change-me-refresh', 'change-me'];

/** The shortest secret worth calling one. */
const MIN_SECRET_LENGTH = 32;

/**
 * Refuses to start in production with a missing, placeholder or trivially short
 * signing secret.
 *
 * Fail loud, at boot, rather than serving traffic that is silently forgeable —
 * this is the repo's error-handling philosophy (root CLAUDE.md §6) applied to
 * the one configuration mistake that cannot be noticed by looking at the running
 * system. Outside production it warns and continues, because a developer who has
 * not written an `.env` yet should get a working API and a clear message, not a
 * crash.
 */
export function assertProductionSecrets(): void {
  const logger = new Logger('Security');
  const isProduction = process.env.NODE_ENV === 'production';

  const problems: string[] = [];
  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = process.env[name];
    if (!value) problems.push(`${name} is not set`);
    else if (PLACEHOLDER_SECRETS.includes(value)) problems.push(`${name} is still the example value`);
    else if (value.length < MIN_SECRET_LENGTH) {
      problems.push(`${name} is shorter than ${MIN_SECRET_LENGTH} characters`);
    }
  }

  // Distinct secrets, so that a token minted for one purpose cannot be presented
  // as the other: with one shared secret a 30-day refresh token is a valid
  // access token, and the short access TTL stops meaning anything.
  if (
    process.env.JWT_ACCESS_SECRET &&
    process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET
  ) {
    problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are the same value');
  }

  if (problems.length === 0) return;

  const summary = problems.map((problem) => `  - ${problem}`).join('\n');
  if (isProduction) {
    throw new Error(
      `Refusing to start: the token signing configuration is unsafe.\n${summary}\n` +
        'Generate one with `openssl rand -base64 48` per secret.',
    );
  }
  logger.warn(`Token signing configuration is unsafe (allowed outside production):\n${summary}`);
}

/**
 * Which origins may call this API from a browser.
 *
 * `cors: true` — the previous setting — answers every origin with permission.
 * The access token lives in an httpOnly cookie on the web app's own origin, so
 * no other site can read one to send; but a reflected allow-all still lets any
 * page on the internet script the *public* surface of this API from a visitor's
 * browser and their address, which is a free scraping proxy for a directory of
 * children's profiles (§11.3).
 *
 * `CORS_ORIGINS` is a comma-separated allowlist. Empty in development means
 * "reflect whatever asked", which keeps `next dev` on a changing port working;
 * empty in production is a configuration error and refuses every browser origin
 * rather than quietly reverting to allow-all — a fail-closed default is the only
 * safe reading of a missing security setting.
 */
export function corsOptions(): CorsOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  const configured = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length === 0 && !isProduction) {
    return { origin: true, credentials: true };
  }

  return {
    origin: configured,
    credentials: true,
    // Only what the client actually sends. `x-active-role` is the role-switch
    // header (§1.2.1); omitting it here would break every narrowed request.
    allowedHeaders: ['Content-Type', 'Authorization', 'x-active-role'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  };
}
