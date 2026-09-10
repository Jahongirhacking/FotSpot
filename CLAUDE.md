# CLAUDE.md — FotSpot (root)

Persistent instructions for any AI assistant (or human) working in this repo. This file covers the
**monorepo as a whole**. Stack-specific rules live in [`backend/CLAUDE.md`](./backend/CLAUDE.md)
and [`client/CLAUDE.md`](./client/CLAUDE.md) — read the relevant one before touching code there.

## 1. What this project is

**FotSpot** is a football talent discovery platform for Uzbekistan connecting players, scouts,
coaches and academies. Sources of truth, in order of authority:

- [`TRIAL.md`](./docs/TRIAL.md) — canonical domain logic for recommendations, trials and squad
  placement. A trial is a real-life examination with a PASS/FAIL verdict by the assigned coach;
  there is no online review step. Where any other document disagrees, TRIAL.md wins.
- [`README.md`](./README.md) — the product spec (TZ/TY). Section numbers are load-bearing and
  referenced from code and docs; never renumber §1–§10, append new material as §11+.
- [`backend/README.md`](./backend/README.md) — what is actually implemented, including the
  items built beyond the §1.23 MVP with explicit sign-off.
- [`docs/BLOG.md`](./docs/BLOG.md) — how admins write blog posts for search; what each editor field feeds.

**Before implementing a feature, check whether it is MVP (§1.23), a signed-off extra, or Phase
1.5/2 (README §3–§8, §11–§15). Do not build deferred features (academy history, pro transition,
badges, transfer/release, guardian accounts, Combine, subscriptions) unless explicitly asked.**

## 2. Monorepo layout

```
/
├── docker-compose.yml   # Postgres 16 + Redis 7 for local dev only (service names: postgres, redis)
├── README.md            # product spec
├── docs/                # TRIAL.md (canonical trial rules), LOCAL_TEAM.md, PLAYER_SQUAD.md, BLOG.md
├── backend/             # NestJS 10 + Prisma 6 API, pnpm      → backend/CLAUDE.md, backend/README.md
└── client/              # Next.js 16 App Router, npm/pnpm     → client/CLAUDE.md, client/AGENTS.md
```

- `backend/` and `client/` are independent packages with their own lockfiles. No workspace tooling,
  no cross-package imports. Types are mirrored by hand (`client/lib/api/types.ts`).
- The API runs on **:3000** (`/api/v1`, Swagger at `/docs`), the client on **:3001**. Both are
  started with pnpm/npm, not Compose.
- Local dev must stay pointed at the docker-compose database. Never reset, migrate-reset or seed
  the production database; never apply migrations blindly.

## 3. Coding standards (everywhere)

- TypeScript only; no `.js` sources, no `any` creep (add a narrow `.d.ts` if a package lacks types).
- `strictNullChecks` is on in both packages; `noImplicitAny` is off in the backend. Don't flip it
  repo-wide without discussion.
- Prefer `??` over `||` for config and env values — `0`, `''` and `false` are legitimate here.
- No commented-out code. Small, single-purpose functions; repeated authorization checks become
  private helpers (`assertAcademyManager`, `ownPlayerProfile`).
- Every user-facing string in the client goes through the i18n dictionaries (uz is the source of
  the `Dictionary` type; ru and en must carry the same keys).
- Never hardcode production URLs, never print or commit secrets (R2 keys, `TELEGRAM_BOT_TOKEN`,
  JWT secrets), never expose bot tokens to the frontend.

## 4. Naming

- Files kebab-case (`recommendations.service.ts`); classes PascalCase with a role suffix
  (`CreateTrialDto`, `JwtAuthGuard`); env vars `SCREAMING_SNAKE_CASE`, documented in the
  package's `.env.example`.
- Branches `feature/<scope>-<desc>` / `fix/<scope>-<desc>`.

## 5. Commits

Conventional Commits, scoped to the module or package:

```
<type>(<scope>): <imperative summary, no trailing period>

[body: why, not what]
```

`type` ∈ `feat | fix | refactor | test | docs | chore | perf | style`; `scope` = module or package
(`trials`, `blog`, `client`, `prisma`, `repo`). One logical change per commit. A Prisma schema
change and its migration ship in the **same** commit, and a route/DTO change ships with the
regenerated `backend/openapi.json` (`pnpm docs:generate`, checked by `pnpm docs:check`).

## 6. Error handling

- Request-facing code throws NestJS `HttpException` subclasses (`NotFound`, `Forbidden`,
  `BadRequest`, `Conflict`, `Unauthorized`), never bare `Error`.
- Don't swallow errors except where an operation is idempotent by definition (unlike/unfollow) —
  and say so in a comment.
- Client: every data boundary has explicit loading and error UI; wrappers in `lib/api/` re-throw a
  typed `ApiError` rather than returning `undefined`.

## 7. Never change without explicit sign-off

- The MVP scope statement in `backend/README.md`, and the rules in `TRIAL.md`.
- The scout reputation formula and tiers in `scout-level.util.ts` (README §1.5).
- Existing Prisma `@id`/relation shapes and migration files — new migrations only.
- Guard order in `backend/src/app.module.ts`: `ThrottleGuard` → `JwtAuthGuard` → `RolesGuard` →
  `PermissionsGuard`.
- `.env.example` keys (rename only with every `ConfigService.get` consumer in the same change) and
  docker-compose service names.
- Media privacy: `private/` keys are only ever reached through presigned URLs minted per read;
  `public/` holds only what an account chose to publish (avatars, academy imagery, blog covers).
- The remaining documented stub: SMS OTP delivery echoes a `devCode` outside production until a
  gateway is configured (`SmsService`). OAuth (Google, Telegram) and R2 storage are real.
- `client/AGENTS.md`: Next 16.2.12 has breaking changes versus older training data — check
  `client/node_modules/next/dist/docs/` before writing Next-specific code.

## 8. Testing

- **Backend**: Jest, `pnpm test` — unit specs beside the code (`*.spec.ts`), Prisma faked; no
  infrastructure needed. Keep it green and add a spec with every service or util change.
- **Client**: `node:test` specs sit beside a few `lib/` modules, but no runner script is wired
  (needs a TS-aware runner such as `tsx`). Verification today is `npm run typecheck`,
  `npm run lint`, `npm run build`, and driving the app in a browser. Don't claim client tests
  pass until a runner exists.
