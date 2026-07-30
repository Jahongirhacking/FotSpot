# CLAUDE.md — FotSpot (root)

Persistent instructions for any AI assistant (or human) working in this repo.
This file covers the **monorepo as a whole**. Deeper, stack-specific rules live in
[`backend/CLAUDE.md`](./backend/CLAUDE.md) and [`client/CLAUDE.md`](./client/CLAUDE.md) — always read
the relevant sub-file before touching code in that directory.

## 1. What this project is

**FotSpot** is a football talent discovery platform connecting
players, scouts, coaches, and academies. The single source of truth for _product_ scope is the root
[`README.md`](./README.md) — a TZ/TY spec. The single source of truth for _implemented MVP_ scope is
[`backend/README.md`](./backend/README.md), which explicitly narrows the spec to section 1.23 only.

**Before implementing any feature, check whether it belongs to the MVP (1.23) or to sections 3–8
("Phase 1.5/2"). Do not implement Phase 2 features (player academy history, pro-transition module,
badges, long-term scout impact, transfer/release workflow) unless explicitly asked — they are
intentionally deferred and their absence is a design decision, not an oversight.**

## 2. Monorepo architecture

```
/
├── docker-compose.yml     # Postgres 16 + Redis 7, local dev infra only
├── README.md              # Full product spec (TZ/TY) — sections 1–10
├── backend/                # NestJS API — see backend/CLAUDE.md
└── client/                 # Next.js App Router frontend — see client/CLAUDE.md
```

- **backend/** and **client/** are independent npm/pnpm packages with their own `package.json`,
  `tsconfig.json`, and lockfile. There is no shared workspace tooling (no Turborepo/Nx) — don't
  assume cross-package imports work.
- `docker-compose.yml` only provisions **infra** (Postgres, Redis). The API and frontend are run
  directly with `pnpm`/`npm`, not via Compose.
- Package manager: **pnpm** for `backend/`, **npm/pnpm** for `client/` (both lockfiles are checked
  in — respect whichever is present, don't introduce a third).

## 3. Coding standards (applies everywhere)

- **TypeScript everywhere.** No `.js` source files. No implicit `any` creep — if a package's types
  are missing, add a narrow local `.d.ts`, don't sprinkle `any`.
- **Strict-ish TS config**: `strictNullChecks` is on in both packages; `noImplicitAny` is off in the
  backend (legacy choice — don't flip it repo-wide without discussion, it will surface a lot of
  existing gaps).
- Prefer nullish coalescing (`??`) over `||` for config/env values, since `0`, `''`, and `false` are
  legitimate values in this domain (ports, counts, flags).
- No commented-out code blocks committed to `main`. Delete or `git stash` instead.
- Keep functions focused: a service method should do one documented thing (see backend's
  `bumpScoutStats`, `assertAcademyManager` pattern of small private helpers).

## 4. Naming conventions (cross-cutting)

- **Files**: kebab-case (`recommendations.service.ts`, `scout-level.util.ts`).
- **Classes**: PascalCase, suffixed by role (`RecommendationsService`, `CreateTrialDto`,
  `JwtAuthGuard`).
- **Branches**: `feature/<scope>-<short-desc>`, `fix/<scope>-<short-desc>`, e.g.
  `feature/trials-application-status`.
- **Env vars**: `SCREAMING_SNAKE_CASE`, always documented in the relevant `.env.example`.

## 5. Commit message rules

Use **Conventional Commits**, scoped to the package/module touched:

```
<type>(<scope>): <short summary, imperative mood, no trailing period>

[optional body: why, not what]
[optional footer: BREAKING CHANGE:, Refs: #123]
```

- `type` ∈ `feat | fix | refactor | test | docs | chore | perf | style`
- `scope` = the module or package, e.g. `recommendations`, `trials`, `auth`, `client`, `prisma`,
  `deps`. For root-level changes use `repo`.
- Examples from this codebase's own conventions:
  - `feat(trials): add service + controller for application status flow`
  - `fix(recommendations): correct success_rate rounding in scout-level.util`
  - `chore(prisma): add initial migration for MVP schema`
  - `docs(backend): document R2 stub extension point`
- One logical change per commit. Don't bundle a schema migration with an unrelated controller
  change.
- If a change alters the Prisma schema, the commit **must** include the generated migration in the
  same commit (never commit a schema change without its migration, or vice versa).

## 6. Error handling philosophy (cross-cutting)

- Fail loud and typed. Prefer NestJS's built-in `HttpException` subclasses
  (`NotFoundException`, `ForbiddenException`, `BadRequestException`, `ConflictException`) over
  generic `Error` throws anywhere request-facing.
- Never swallow an error silently _except_ where already established as an explicit pattern (e.g.
  `MediaService.unlike`'s `.catch(() => undefined)` for idempotent deletes — that's a deliberate
  "delete is idempotent" choice, not sloppiness; don't copy it elsewhere without the same
  justification).
- Client-side: every data-fetching boundary should have an explicit loading/error UI — don't let
  fetch failures render a blank page.

## 7. What should NEVER be changed without explicit sign-off

- **`backend/README.md`'s stated MVP scope** — don't silently expand it to Phase 1.5/2 features.
- **The Scout Reputation formula and level tiers** in `scout-level.util.ts`
  (`success_rate = accepted / total * 100`, the 6 level thresholds/weights) — these are copied
  verbatim from the product spec section 1.5. Changing them is a product decision, not a refactor.
- **Prisma schema `@id`/relation shapes** for existing models — these are live migration history;
  renaming/removing a field needs a proper migration, never a manual DB edit.
- **The guard order in `backend/src/app.module.ts`**
  (`JwtAuthGuard` → `RolesGuard` → `PermissionsGuard`) — this order is load-bearing for
  `@Public()` to short-circuit correctly and for role checks to run before fine-grained permission
  checks. Re-ordering silently breaks auth.
- **`.env.example` keys** — don't rename without updating every consumer
  (`ConfigService.get(...)` call sites) in the same change.
- **`docker-compose.yml` service names** (`postgres`, `redis`) — `DATABASE_URL`/`REDIS_URL` in
  `.env.example` assume these hostnames.
- **The three documented stub extension points** (OAuth token verification, SMS gateway, R2
  presigned upload) — these are intentionally unimplemented per `backend/README.md`. Don't "fix"
  them by faking success; either wire the real integration or leave the stub with its comment
  intact.
- **`client/AGENTS.md`'s warning** — this Next.js version (16.2.12) has breaking API changes vs.
  older training data. Always check `client/node_modules/next/dist/docs/` before writing
  Next.js-specific code (routing, config, data fetching APIs).

## 8. Testing strategy (repo-wide status)

No test suite exists yet in either package. When adding tests, follow the stack-specific guidance
in `backend/CLAUDE.md` §Testing and `client/CLAUDE.md` §Testing rather than inventing a new
convention here. Do not claim "tests pass" or add CI test steps until a real runner is wired up in
`package.json`.
