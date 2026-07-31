import { Logger, LogLevel, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';
import { AppModule } from './app.module';
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
  const app = await NestFactory.create(AppModule, { cors: true, logger: logLevels() });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1');

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
