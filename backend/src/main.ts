import { Logger, LogLevel, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { assertProductionSecrets, corsOptions } from './common/security.config';
import './instrument';
import { setupSwaggerUi } from './swagger';

/**
 * `debug` and `verbose` are dropped in production.
 *
 * The exception filter logs every ordinary 4xx at `debug` — useful while
 * developing, where a failed validation is something you want to see at once. In
 * production that is a line per bad request, which buries the `error` entries
 * that actually need someone to look at them.
 */
function logLevels(): LogLevel[] {
  return process.env.NODE_ENV === 'production'
    ? ['error', 'warn', 'log']
    : ['error', 'warn', 'log', 'debug', 'verbose'];
}

async function bootstrap() {
  // Before anything binds a port: a process with a forgeable signing key should
  // never reach the point of accepting a request.
  assertProductionSecrets();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: corsOptions(),
    logger: logLevels(),
  });

  /*
   * Security headers on every response.
   *
   * This process serves JSON and the Swagger UI, not the product's pages, so the
   * headers that matter here are the ones that hold whatever a browser is
   * tricked into treating as a document: `nosniff` stops a JSON error body being
   * executed as script, `frameguard` stops the API being framed, and HSTS keeps
   * a token from ever crossing plain HTTP.
   *
   * CSP is off because `setupSwaggerUi` serves an inline-script page and a policy
   * strict enough to be worth having would break it; the client app sets its own,
   * which is where a CSP actually does work.
   */
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      // Signed R2 URLs are fetched from the web app's origin, so the API must not
      // claim same-origin-only for the resources it hands out.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  /*
   * How many proxies stand in front of this process.
   *
   * Express uses it to decide which entry of `X-Forwarded-For` is the real
   * client, and `ThrottleGuard` and the auth lockout both key on that address.
   * Left at 0, a forwarded address is ignored entirely — correct for a directly
   * reachable process, and the safe default: trusting the header when nothing
   * strips it lets any caller mint a new identity per request and walk straight
   * through both limiters.
   */
  const trustedHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (trustedHops > 0) app.set('trust proxy', trustedHops);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // A JSON body larger than this is not a request this API has any use for, and
  // parsing it is work an attacker gets for free. Uploads never come through
  // here — they go straight to R2 with a presigned PUT.
  app.useBodyParser('json', { limit: '256kb' });
  app.useBodyParser('urlencoded', { limit: '256kb', extended: true });

  // `/health` sits outside the version prefix: a load balancer probing liveness
  // is not a client of the API and should not have to follow its versioning.
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  // Interactive reference at /docs, raw spec at /docs/openapi.json. Registered
  // after the prefix so documented paths match the real ones.
  setupSwaggerUi(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  // Nest's Logger rather than console.log, so startup lines carry the same
  // timestamps and formatting as everything else — a boot message that looks
  // unlike the rest of the log is one that gets scrolled past.
  const logger = new Logger('Bootstrap');
  logger.log(`FotSpot API running on http://localhost:${port}/api/v1`);
  logger.log(`API reference at    http://localhost:${port}/docs`);
}

/**
 * A failure here means the process never served a request. Without this it exited
 * on an unhandled rejection with no explanation — indistinguishable from a clean
 * shutdown to whatever is supervising it.
 */
bootstrap().catch((error) => {
  new Logger('Bootstrap').error(
    'The API failed to start',
    error instanceof Error ? error.stack : String(error),
  );
  process.exit(1);
});
