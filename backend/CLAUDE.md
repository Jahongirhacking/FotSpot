# CLAUDE.md — backend (NestJS API)

Read [`../CLAUDE.md`](../CLAUDE.md) first for repo-wide rules. This file is backend-specific and
goes deeper, since you're learning backend — explanations here assume you want the _why_, not just
the _what_.

## 1. Architecture

**Modular monolith** on NestJS 10, per `README.md` §1.15. Each domain is a self-contained Nest
module: `Module` (DI wiring) + `Service` (business logic) + `Controller` (HTTP surface) + `dto/`
(input validation/shape). Modules only talk to each other through exported providers
(`exports: [XService]` in the module), never by reaching into another module's internals directly.

Why modular monolith and not microservices: the spec (§1.20) wants horizontal scaling _later_ via
stateless API + shared Postgres/Redis, not service-per-domain now. A monolith with clean module
boundaries is the correct MVP shape — it can be split later because the boundaries already exist.

Cross-cutting concerns are wired centrally in `src/app.module.ts` via `APP_GUARD`/`APP_FILTER`
providers rather than per-controller decorators, so every route gets them by default:

```
JwtAuthGuard   → authenticates (or short-circuits for @Public() routes)
RolesGuard     → checks @Roles(...) if present
PermissionsGuard → checks @RequirePermissions(...) if present
HttpExceptionFilter → normalizes every thrown exception into one JSON shape
```

**Request flow**: `main.ts` global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`
→ guards (above) → controller → service → `PrismaService` (Postgres) and/or `RedisService` (cache)
→ response, with `HttpExceptionFilter` catching anything thrown along the way.

Global API prefix: **`/api/v1`** (set in `main.ts`). All routes are relative to that.

## 2. Folder structure

```
backend/
├── prisma/
│   ├── schema.prisma          # single source of truth for the data model
│   ├── migrations/            # generated, never hand-edited
│   └── seed.ts                # default roles + bootstrap super_admin
├── src/
│   ├── main.ts                 # bootstrap: ValidationPipe, global prefix, CORS
│   ├── app.module.ts            # module imports + global guard/filter wiring
│   ├── common/
│   │   ├── decorators/          # @Public, @Roles, @RequirePermissions, @CurrentUser
│   │   ├── guards/               # JwtAuthGuard, RolesGuard, PermissionsGuard
│   │   └── filters/               # HttpExceptionFilter
│   ├── prisma/                   # PrismaService (@Global module)
│   ├── rbac/                     # RbacService — role/permission assignment + effective-access lookup
│   ├── auth/                     # AuthService, AuthController, JwtStrategy, dto/
│   ├── redis/                    # RedisService (@Global) + typed key helpers
│   ├── audit/                    # AuditService (@Global) + AuditAction keys
│   ├── users/  players/  coaches/  academies/  media/  follows/
│   ├── recommendations/          # + scout-level.util.ts / scout-trust.util.ts (pure, no DI)
│   ├── trials/  notifications/  moderation/  admin/
│   └── .env.example
└── package.json
```

**One module = one directory** under `src/`, named after the domain in plural
(`recommendations/`, `trials/`), each containing at minimum `*.module.ts`, `*.service.ts`,
`*.controller.ts`, `dto/*.dto.ts`. Pure, DI-free business logic (formulas, calculations) belongs in
a `*.util.ts` file beside the service, not inline in the service — see `scout-level.util.ts` as the
template: it's independently unit-testable without spinning up Nest's DI container.

## 3. Coding standards

- `strictNullChecks: true`, `noImplicitAny: false` (see root CLAUDE.md — don't change without
  discussion).
- Narrow `T | undefined` config values with `??`, not by asserting (`!`) or widening the type.
  Example already in the codebase (port, OTP TTL): `this.config.get('PORT') ?? 3000`.
- Services depend on `PrismaService` via constructor injection, never `new PrismaClient()` directly
  — `PrismaService` is `@Global()` so it's always available without re-importing `PrismaModule`.
- Keep controllers thin: parameter extraction + delegate to service, one line per branch. All
  validation logic belongs in DTOs (`class-validator` decorators), not in controller/service
  `if` checks.
- Private helper methods for repeated authorization checks (`assertAcademyManager`,
  `assertManager`, `ownPlayerProfile`) — copy this pattern rather than inlining a Prisma lookup +
  `if (!x) throw` in every public method.

## 4. Naming conventions (backend-specific)

| Thing                  | Convention                           | Example                                                      |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------ |
| Module dir             | plural noun                          | `recommendations/`, `trials/`                                |
| Service class          | `<Domain>Service`                    | `RecommendationsService`                                     |
| Controller class       | `<Domain>Controller`                 | `RecommendationsController`                                  |
| DTO class              | `<Verb><Domain>Dto`                  | `CreateRecommendationDto`, `UpdateTrialApplicationStatusDto` |
| Guard                  | `<Purpose>Guard`                     | `JwtAuthGuard`, `PermissionsGuard`                           |
| Decorator (factory fn) | camelCase, PascalCase alias exported | `export const Roles = (...) => SetMetadata(...)`             |
| Prisma model           | PascalCase singular                  | `PlayerProfile`, `AcademyMember`                             |
| Prisma enum            | PascalCase, values SCREAMING_SNAKE   | `RecommendationStatus.ACCEPTED`                              |
| Route param            | camelCase matching DTO field         | `:academyId`, `:applicationId`                               |

## 5. API patterns

- **REST, resource-oriented**, under `/api/v1`. Nesting reflects ownership:
  `POST /trials/academy/:academyId`, `GET /trials/:id/applications`.
- **Auth**: every route requires a valid JWT by default (global `JwtAuthGuard`). Opt out with
  `@Public()` — used for genuinely public reads (search, public profiles, upcoming trials).
  Never add `@Public()` to a mutation route.
- **Authorization layering**:
  1. `@Roles('admin', 'super_admin')` at the controller/handler level for coarse role gates.
  2. `@RequirePermissions('key')` for fine-grained permission checks (RBAC-driven).
  3. Ownership checks (`assertAcademyManager`, `assertOwner`) done manually in the service when
     the check depends on request data (e.g. "is this user the manager _of this specific
     academy_"), because that can't be expressed as a static decorator.
- **Current user**: always via `@CurrentUser() user: AuthUser` (custom param decorator reading
  `request.user`, populated by `JwtStrategy.validate`). Never read `req.user` manually.
- **DTOs are mandatory** for every mutating endpoint — `class-validator` decorators + the global
  `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` means unknown fields are
  rejected outright, not silently dropped.
- **Pagination**: `page`/`pageSize` query params with `@Type(() => Number)` + `@IsInt() @Min(1)`
  and sane defaults (see `SearchPlayersDto`). Return `{ items, total, page, pageSize }`.
- **Notifications**: state-changing events that another user cares about
  (`RECOMMENDATION_ACCEPTED`, `TRIAL_INVITATION`, etc.) go through `NotificationsService.notify()`,
  which persists a `Notification` row _and_ pushes over the Socket.IO `notifications` namespace.
  Don't push a WS event without also persisting it, and vice versa — they must stay in sync.
- **Caching**: Redis caching is opt-in at the service layer for read-heavy, slow-changing data
  (academies profile reads). Cache keys go through `RedisService`'s typed key helpers — don't
  build raw Redis key strings inline in a service.

## 6. Error handling

- Throw NestJS's built-in exceptions; let `HttpExceptionFilter` (global) normalize the response
  shape to:
  ```json
  { "statusCode": 404, "timestamp": "...", "error": { ...NestJS exception response... } }
  ```
- Standard mapping used throughout the codebase — follow it:
  - Resource doesn't exist → `NotFoundException`
  - Caller isn't allowed to do this → `ForbiddenException`
  - Caller-supplied data is invalid/conflicts with state → `BadRequestException`
  - Duplicate unique resource → `ConflictException`
- Auth failures (bad credentials, bad/expired token) → `UnauthorizedException`, not
  `ForbiddenException` — the distinction matters (401 = "who are you", 403 = "I know who you are,
  you can't do this").
- Idempotent-delete exception: `MediaService.unlike` swallows a "not found" delete error on
  purpose — unliking something already unliked is not an error from the caller's perspective. Only
  copy this pattern when the operation is genuinely idempotent by domain definition.
- Don't leak Prisma error internals (constraint names, SQL) to the client — catch and rethrow as a
  domain-appropriate `HttpException` if a raw Prisma error could surface.

## 7. State management

N/A in the traditional frontend sense — the backend _is_ the source of truth. Two things to keep in
sync deliberately:

- **Postgres via Prisma** is authoritative for everything. Redis is a cache/derived-state layer
  only — nothing should exist in Redis that can't be reconstructed from Postgres.
- **JWT claims** (`roles`, `permissions`) are a snapshot taken at `login`/`refresh` time
  (`RbacService.getEffectiveAccess`). If a user's roles change mid-session, their existing access
  token still reflects the old claims until they refresh. This is a known, accepted staleness
  window — don't "fix" it by hitting the DB on every request unless asked to.

## 8. Testing strategy

**Jest is wired** (`pnpm test`, config in `jest.config.js`, `rootDir: src`, specs matched by
`*.spec.ts`). Current coverage is the pure reputation utils only — `scout-level.util.spec.ts` and
`scout-trust.util.spec.ts`. Everything below still applies when extending it:

- Use **Jest** (already NestJS's default tooling, `@nestjs/testing`) — don't introduce Vitest here.
- **Unit test services** with Prisma mocked (`jest.mock` or a lightweight fake) — the goal is
  testing business logic (e.g. `scout-level.util.ts` tier boundaries, `TrialsService.apply` age-
  range validation) without a real DB.
- **Pure util files** (`scout-level.util.ts`) need no Nest testing module at all — plain Jest
  `describe/it` against the exported functions.
- **E2E tests** (`@nestjs/testing` + `supertest`) belong in a top-level `test/` dir per Nest
  convention, one spec per module, spun up against a real (test) Postgres via
  `docker-compose.yml` — not against the dev database.
- Don't add tests for the three documented stubs (OAuth verify, SMS send, R2 presign) beyond
  asserting they return the documented stub shape — they aren't real integrations yet.

## 9. What should never be changed (backend-specific — see also root §7)

- **`SCOUT_LEVEL_TIERS` array and `computeSuccessRate`/`computeScoutLevel`** in
  `scout-level.util.ts` — exact spec formula (§1.5), order matters (highest tier first, `.find()`
  short-circuits on the first match).
- **Migration files under `prisma/migrations/`** — immutable history once merged. Schema changes
  are new migrations (`pnpm prisma:migrate`), never edits to existing SQL files.
- **`PERMISSIONS_KEY` / `ROLES_KEY` / `IS_PUBLIC_KEY` metadata key strings** in
  `common/decorators/*` — guards look these up by exact string via `Reflector`; renaming one
  without updating its paired guard silently disables that check.
- **`main.ts`'s `ValidationPipe` options** (`whitelist`, `forbidNonWhitelisted`, `transform`) —
  loosening these reopens mass-assignment / unknown-field vulnerabilities across every DTO in the
  app at once.
- **Argon2 for password/OTP hashing** — don't swap to bcrypt or a custom hash without a security
  review; it's explicitly chosen per spec §1.3/1.21.
