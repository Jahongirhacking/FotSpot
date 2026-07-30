import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/**
 * OpenAPI document for the FotSpot API.
 *
 * The spec is **derived from the code**, not hand-maintained: routes come from the
 * controllers, request bodies and responses from the DTO classes (via the
 * `@nestjs/swagger` CLI plugin configured in `nest-cli.json`, which reads the
 * TypeScript types and class-validator decorators). A route or field that changes
 * shows up in the document on the next build without anyone editing prose.
 *
 * `pnpm docs:generate` writes `openapi.json`; `pnpm docs:check` fails if the
 * committed file no longer matches the code, so drift is caught in review rather
 * than discovered by whoever is integrating against it.
 */

/** Tag names, one per module. Declared here so the sidebar has a deliberate order. */
export const API_TAGS = [
  { name: 'auth', description: 'Registration, login (password / phone OTP / OAuth), sessions.' },
  { name: 'users', description: 'Own profile, avatar, and changing phone or email.' },
  { name: 'players', description: 'Player profiles, search, and self-reported statistics.' },
  { name: 'coaches', description: 'Coach profiles and 1–10 player assessments.' },
  { name: 'academies', description: 'Academies and their staff. Creation is admin-only.' },
  { name: 'trials', description: 'Trials and applications (Applied → Shortlisted → Invited → …).' },
  {
    name: 'recommendations',
    description:
      'Scout recommendations, the credibility-ranked academy inbox, and scout reputation.',
  },
  { name: 'follows', description: 'Scout → player/academy follows, and academy → scout trust.' },
  { name: 'media', description: 'Player media uploads, likes, views and comments.' },
  { name: 'notifications', description: 'Persisted notifications. Realtime push is a WebSocket.' },
  { name: 'moderation', description: 'Reports and their resolution.' },
  { name: 'admin', description: 'Verification queues, roles and audit logs.' },
] as const;

const DESCRIPTION = `
REST API for **FotSpot** — a grassroots→academy football pipeline for Uzbekistan.
See the [product spec](https://github.com/Jahongirhacking/FotSpot/blob/main/README.md)
for the domain rules these endpoints implement; section references like \`§1.5\`
below point into it.

### Conventions

- Every path is prefixed **\`/api/v1\`**.
- **Auth**: send \`Authorization: Bearer <accessToken>\`. Endpoints marked with a
  padlock require it; the rest are public (guests can browse players, academies,
  public profiles and upcoming trials — §1.2).
- **Errors** all share one shape, produced by a global exception filter:
  \`\`\`json
  { "statusCode": 404, "timestamp": "2026-07-30T09:00:00.000Z",
    "error": { "message": "Player not found", "error": "Not Found", "statusCode": 404 } }
  \`\`\`
  \`401\` means "who are you", \`403\` means "I know who you are, and no".
- **Unknown fields are rejected**, not ignored (\`forbidNonWhitelisted\`). A typo in a
  body field returns 400 rather than silently doing nothing.
- **Pagination** on list endpoints: \`page\` / \`pageSize\` query params, response
  \`{ items, total, page, pageSize }\`.

### Sessions

Login returns a short-lived \`accessToken\` and a rotating \`refreshToken\` bound to
one device (§1.21). Reusing an already-rotated refresh token revokes that session —
treat a \`401\` from \`/auth/refresh\` as "sign in again", not as something to retry.

### Not yet implemented (deliberately)

Three integrations are stubs with no credentials, and say so in their responses
rather than pretending to work:

| Area | Behaviour today |
| --- | --- |
| SMS (login OTP, contact change) | Code is generated and stored; outside production it is echoed back as \`devCode\`. Nothing is sent. |
| Email delivery | Same as SMS. \`deliveryConfigured: false\`. |
| Cloudflare R2 uploads | \`uploadUrl\` is a placeholder; \`storageConfigured\` tells you whether bytes will actually persist. |
| OAuth | \`providerToken\` is **not** verified against the provider yet. |
`.trim();

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('FotSpot API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'The `accessToken` returned by any `/auth/*` login endpoint.',
      },
      'bearer',
    )
    .addServer('http://localhost:3000', 'Local development')
    .setExternalDoc('Product spec (README)', 'https://github.com/Jahongirhacking/FotSpot');

  for (const tag of API_TAGS) builder.addTag(tag.name, tag.description);

  return SwaggerModule.createDocument(app, builder.build(), {
    // Operation ids like `players_search` instead of `PlayersController_search`:
    // these become method names in generated clients.
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '').toLowerCase()}_${methodKey}`,
  });
}

/** Mounts the interactive explorer at `/docs`. */
export function setupSwaggerUi(app: INestApplication) {
  const document = buildOpenApiDocument(app);

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
    swaggerOptions: {
      // Keep the bearer token across a page reload so exploring doesn't mean
      // re-pasting it after every change.
      persistAuthorization: true,
      docExpansion: 'none',
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      tryItOutEnabled: true,
    },
    customSiteTitle: 'FotSpot API reference',
  });
}
