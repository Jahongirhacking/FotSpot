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
  (spec 1.17). Redis adapter is *not* wired in this MVP (single instance is
  enough until horizontal scaling is actually needed) — it's a one-line
  addition (`@socket.io/redis-adapter`) when it is.
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
- **Academy registration → review → approval** (1.10): creator becomes a
  pending `MANAGER` member; approval grants `academy_manager`.
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

## Deliberately not built (per MVP scope, 1.23 "Excluded" + section 9)

Chat, Payments, Live Streaming, Transfer Market, AI Video Analysis, Mobile
Apps, Fantasy Football, and everything in README sections 3–8 (player
academy history, pro-transition dashboard, badges, long-term scout impact,
transfer/release workflow).
