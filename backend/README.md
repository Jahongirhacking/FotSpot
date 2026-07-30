# FotSpot Backend (MVP)

Minimal, necessary NestJS implementation of the FotSpot TZ/TY (see project
`README.md`), scoped strictly to **section 1.23 MVP**:

Auth · RBAC · Player Profiles · Academy Profiles · Scout Recommendations ·
Coach Assessments · Trial Management · Notifications · Moderation · Admin.

Sections 3–8 of the spec (post-acceptance lifecycle, professional transition,
badges, extended scout-impact scoring) are **Phase 1.5/2 per the spec's own
section 9** and are intentionally not modeled — adding them later is additive
(new tables + a module), not a rewrite, because `player_academy_histories`
and friends don't conflict with anything here.

## Project Setup

```bash
npx prisma generate
```

```bash
sudo docker run --name fotspot-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=fotspot \
  -p 5432:5432 \
  -d postgres:16
```

```bash
sudo docker run --name fotspot-redis \
  -p 6379:6379 \
  -d redis:7
```

## Stack & why

- **NestJS** (modular monolith, per 1.15), modules matching 1.15 closely
  (Auth, Users, Players, Coaches, Academies, Media, Recommendations, Trials,
  Notifications, Moderation, Admin, RBAC, Audit).
- **Prisma + PostgreSQL** — the spec names Postgres but not an ORM; Prisma
  gives typed queries and migrations with the least boilerplate for an MVP.
- **class-validator/class-transformer** for request validation (global
  `ValidationPipe` in `main.ts`).
- **argon2** for password/OTP hashing (spec 1.3/1.21).
- **@nestjs/websockets** (Socket.IO) for the notifications-only gateway
  (spec 1.17). Redis adapter is _not_ wired in this MVP (single instance is
  enough until horizontal scaling is actually needed) — it's a one-line
  addition (`@socket.io/redis-adapter`) when it is.
- **ioredis** behind a `RedisService` (`src/redis/`) for the read-through cache
  in 1.19. Cache failures degrade to Postgres rather than erroring — Postgres
  stays authoritative, so nothing is lost when Redis is down.
- **Jest** (`pnpm test`) for unit tests. Currently covering the pure reputation
  utils; see "Testing" below.
- **BullMQ** is declared as a dependency for the queue jobs in 1.18, but no
  workers are implemented in this pass — video/thumbnail/email jobs aren't
  "necessary and minimal" for a functioning MVP API and are pure
  infrastructure wiring once real media/SMS/email providers exist.

## Deliberate stubs / extension points (called out in code comments)

These are the three places where the spec depends on external services
Claude has no credentials for. Each is implemented as a real interface with
a clearly marked stub body, not faked as if it worked:

1. **OAuth** (`AuthService.oauthLogin`) — accepts a provider token but does
   **not** verify it against Google/Facebook/OneID yet. Wire real
   verification before trusting the email it's given.
2. **SMS delivery** (`AuthService.requestOtp`) — OTP is generated, hashed,
   and stored correctly; in non-production it's echoed back in the response
   (`devCode`) so the flow is testable without an SMS gateway (e.g. Eskiz).
3. **Cloudflare R2 uploads** (`R2StorageService.getUploadUrl`) — returns a
   deterministic object key and a stub URL. Swap in a real presigned PUT via
   `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` pointed at the R2
   S3-compatible endpoint.

## Business logic implemented in full

- **RBAC** (1.4): `users/roles/permissions/user_roles/role_permissions`
  tables + `RolesGuard`/`PermissionsGuard`, both driven by claims embedded in
  the JWT at login/refresh (`RbacService.getEffectiveAccess`).
- **Scout Reputation** (1.5): `computeSuccessRate` / `computeScoutLevel` in
  `recommendations/scout-level.util.ts` implement the exact formula and the
  six level tiers (Observer → Legendary Scout) with their thresholds and
  weights; recalculated on every recommendation creation/acceptance.
- **Recommendation status flow** (1.8): PENDING → REVIEWING →
  ACCEPTED/REJECTED, academy-manager-only transitions, reputation bump +
  notifications fired on ACCEPTED/REJECTED.
- **Coach verification gating** (1.9): assessments can only be submitted by
  a `CoachProfile` with `status = VERIFIED`; verifying a coach grants the
  `coach` RBAC role.
- **Academy creation** (1.10, revised): **admin/super_admin only** — there are
  roughly 50 academies in Uzbekistan, so they are onboarded by the platform team
  rather than self-registered. An optional `managerUserId` names the account that
  will run it and is granted `academy_manager`; the creating admin does not become
  the manager. Admin-created academies start `VERIFIED` (a human already vetted
  them) and the creation is audit-logged.
- **Trial application flow** (1.11): Applied → Shortlisted → Invited →
  Rejected/Accepted, with an age-range check against the player's
  `birthDate` and the trial `date`.
- **Notifications** (1.12): persisted `Notification` rows + realtime push
  over the `notifications` Socket.IO namespace, fired for recommendation
  outcomes, trial invitations/results, and verification results.
- **Moderation** (1.13): reports against users/media/academies/coaches,
  admin resolution, optional media takedown.
- **Admin vs Super Admin** (1.2): `admin`/`super_admin`-gated routes;
  plain admins can verify coaches/academies/moderate/view audit logs but
  cannot create admins or manage roles/permissions — only `super_admin` can.
- **Follows** (1.2): scouts follow players and academies (`Follow`, polymorphic
  over `targetType`). Unfollow is idempotent, as with `MediaService.unlike`.
- **Media engagement** (1.14): `media_views` (guest-attributable, never pushed
  over WebSocket per 1.17) and `media_comments` with author-only deletion.
- **Sessions & device tracking** (1.21): one `Session` row per logged-in device,
  refresh tokens carry their session id as `sid` and rotate per device. Reusing
  an already-rotated refresh token revokes that session (replay detection).
  `GET /auth/sessions` lists active devices; logout takes one device or all.
- **Caching** (1.19): player and academy profile reads go through `RedisService`,
  invalidated on every write that could stale them (including media upload,
  which is embedded in the player profile payload).
- **Audit logging** (1.21): `AuditService.record()` writes an actor-attributed
  row for coach/academy verification, admin grants and revocations, permission
  and role-permission changes, report resolution and media takedown.

## Beyond MVP: v1.1/v1.3 items built with explicit sign-off

These come from README sections the spec's own §9 defers. They were built at the
owner's request, not by scope drift:

- **Academy → scout trust** (1.5.2): `AcademyScoutFollow` (FOLLOWING/MUTED) plus
  `scout-trust.util.ts`. An academy's trust scales a scout's weight _in that
  academy's ranking only_, capped at 2.0 so it can never promote a scout a full
  tier. It deliberately does not feed global reputation — see the util's header.
- **Ranked academy inbox** (1.5.1): `GET /recommendations/academy/:id/ranked`
  groups recommendations per player and collapses them with the harmonic
  discount, so fabricated volume is worth ~ln(n).
- **`playingStyle`** (21.3): enum on `PlayerProfile` + a search filter, so
  "we need a Destroyer, U16, Fergana" is expressible.

## Running it

```bash
cp .env.example .env        # fill in DATABASE_URL at minimum
npm install
npm run prisma:migrate      # creates tables
npm run seed                # default roles + a super_admin bootstrap account
npm run start:dev
```

API is served under `/api/v1`. WebSocket notifications connect to the
`/notifications` namespace with `{ auth: { token: <accessToken> } }`.

## API reference

```bash
pnpm start:dev            # then open http://localhost:3000/docs
```

`/docs` is an interactive Swagger UI: every endpoint, its request body, its
responses, and a **Try it out** button. Paste an `accessToken` into _Authorize_
once and it persists across reloads. The raw spec is at `/docs/openapi.json`, and
a committed copy lives at [`openapi.json`](./openapi.json) so it can be diffed in
review and fed to client generators without running the server.

### Keeping it in sync

The spec is **generated from the code**, never hand-written. Routes come from the
controllers; request and response schemas come from the DTO classes, read by the
`@nestjs/swagger` CLI plugin (configured in `nest-cli.json`) which infers types
from TypeScript and `class-validator` decorators. Doc comments on a route become
its description, so the explanation lives next to the code it explains.

```bash
pnpm docs:generate   # rebuild openapi.json after changing a route or DTO
pnpm docs:check      # fails if openapi.json is stale — run this in CI
```

`docs:check` regenerates and compares. If they differ it prints which operations
were added or removed and exits non-zero, leaving your working tree untouched:

```
openapi.json is out of date — the API changed but the spec was not regenerated.

  added (1):
    + GET /api/v1/notifications/unread-count

Fix with: pnpm docs:generate   (then commit openapi.json)
```

Two things worth knowing:

- Generation runs in Nest's **preview mode**, so it needs no database, no Redis and
  no credentials — it works in CI and on a laptop with nothing running.
- A Prisma enum used in a DTO renders as an opaque object unless the field also
  carries `@ApiProperty({ enum: X, enumName: 'X' })`. The plugin only sees a type
  reference. `playingStyle`, `channel`, `targetType` and `state` are annotated for
  this reason — copy that pattern for any new Prisma-enum field.

## Testing

```bash
pnpm test          # unit specs, no infrastructure required
pnpm test:cov      # with coverage
```

Unit specs sit beside the code (`*.spec.ts`). Current coverage is the pure
reputation logic — `scout-level.util.spec.ts` (tier boundaries, the geometric
weight ladder, credibility aggregation) and `scout-trust.util.spec.ts` (trust
multipliers, and the invariant that trust can never promote a scout a tier).
Service-level specs with a mocked Prisma and e2e specs under a top-level
`test/` dir are still to come — see `CLAUDE.md` §8.

> `pnpm lint` currently crashes on Node 18 (ESLint 10's stylish formatter calls
> `util.styleText`, added in Node 20). Use `npx eslint . -f compact` until the
> toolchain moves to Node 20+. Unrelated to application code.

## Deliberately not built (per MVP scope, 1.23 "Excluded" + section 9)

Chat, Payments, Live Streaming, Transfer Market, AI Video Analysis, Mobile
Apps, Fantasy Football, and everything in README sections 3–8 (player
academy history, pro-transition dashboard, badges, long-term scout impact,
transfer/release workflow).

Also still unbuilt from the Phase 1.5 sections: §11 guardian consent and minor
visibility, §12 age verification and integrity rules, §13 Combine sessions and
the Player Index, §15 subscriptions. **§11 in particular is a launch blocker —
this API currently has no notion of a guardian, and must not be pointed at real
minors until it does.**

## Migrations

The migration `20260729145853_add_sessions_follows_media_engagement_playing_style`
was generated offline with `prisma migrate diff` (no database was reachable in
the authoring environment) and has **not yet been applied or round-tripped
against a live Postgres**. Before trusting it:

```bash
docker compose up -d postgres redis
pnpm prisma:migrate         # applies and verifies against the dev database
```

Note it drops `User.refreshTokenHash` in favour of the `Session` table, so any
existing logged-in users are signed out once applied.
