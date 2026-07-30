import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './swagger';

/**
 * Writes `openapi.json` from the live route definitions.
 *
 * Runs in Nest's **preview mode**, which builds the module graph without
 * instantiating providers or running lifecycle hooks. That matters because
 * `PrismaService.onModuleInit` eagerly connects: without preview mode, generating
 * the spec would require a running database, which would make it useless in CI and
 * annoying locally.
 *
 * Usage:
 *   pnpm docs:generate   # build, then write openapi.json
 *   pnpm docs:check      # fail if the committed file is stale
 */
async function generate() {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
    abortOnError: false,
  });

  // Matches main.ts, so paths in the document are the real ones.
  app.setGlobalPrefix('api/v1');
  await app.init();

  const document = buildOpenApiDocument(app);
  const target = resolve(process.cwd(), 'openapi.json');

  // Trailing newline so the file is diff-friendly and POSIX-clean.
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await app.close();

  const operations = Object.values(document.paths).reduce(
    (total, path) => total + Object.keys(path).length,
    0,
  );
  // eslint-disable-next-line no-console
  console.log(
    `Wrote openapi.json — ${Object.keys(document.paths).length} paths, ${operations} operations.`,
  );
}

generate().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate openapi.json:', error);
  process.exit(1);
});
