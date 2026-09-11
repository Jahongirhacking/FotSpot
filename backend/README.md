# FotSpot Backend

NestJS implementation of the FotSpot TZ/TY (see project `README.md`), scoped to
**section 1.23 MVP** plus the items listed under "Beyond MVP" below, each built
with explicit sign-off. Trials, recommendations and squad placement follow
[`../docs/TRIAL.md`](../docs/TRIAL.md), which is canonical.

Auth · RBAC · Player Profiles · Academy Profiles · Scout Recommendations ·
Coach Assessments · Trial Management · Notifications · Moderation · Admin ·
Media processing · Blog.

Sections 3–8 of the spec (post-acceptance lifecycle, professional transition,
badges, extended scout-impact scoring) are **Phase 1.5/2 per the spec's own
section 9** and are intentionally not modeled — adding them later is additive
(new tables + a module), not a rewrite, because `player_academy_histories`
and friends don't conflict with anything here.

## Project Setup

```bash
docker compose up -d          # from the repo root: Postgres 16 + Redis 7
cp .env.example .env          # local values only — see "Development stays local"
pnpm install
pnpm prisma:generate
pnpm prisma:migrate           # applies migrations to the dev database
pnpm seed                     # roles + the bootstrap super_admin (once)
pnpm start:dev                # http://localhost:3000/api/v1 · Swagger at /docs
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
- **Jest** (`pnpm test`) for unit specs beside the code; see "Testing" below.
- **BullMQ** on the same Redis for the jobs in 1.18 that exist today:
  `media-processing` (ffmpeg transcode + poster, `MediaProcessor`), `trials`
  (the delayed consequences of a verdict, undoable for 30 s), `invitations`
  (delayed squad-invitation effects) and `telegram-delivery`. Workers are tuned
  for an idle queue on a per-command-billed Redis — see "Managed Postgres and
  Redis" below.
- **Cloudflare R2** (S3 API) for objects, **Resend** for email, an HTTP SMS
  gateway (`SmsService`), and a **Telegram bot** for operator alerts and
  user notifications, all optional in development: each reports `sent: false`
  and logs when its variables are missing.

## Deliberate stubs / extension points (called out in code comments)

These are places where the spec depends on external services. Each is a real
interface with a clearly marked stub body, not faked as if it worked:

1. ~~**OAuth**~~ — **now implemented** for Google and Telegram; see "Social
   sign-in" below. The old `POST /auth/oauth` is gone: it took an email
   alongside an unverified provider token and trusted it, which made it a way to
   sign in as any address a caller could name.
2. **SMS delivery** — `SmsService` posts to whatever gateway `SMS_API_URL`,
   `SMS_API_TOKEN` and `SMS_SENDER` name. Without them the OTP is still
   generated, hashed and stored, and outside production it is echoed back in
   the response (`devCode`) so the flow is testable. Registration and password
   codes behave the same way through `EmailService` without `RESEND_API_KEY`.

**Cloudflare R2 is no longer a stub** — `StorageService` issues genuine
presigned PUT and GET URLs. Two pieces of setup are required and neither can be
done from application code:

### 1. The bucket needs a CORS policy

The browser PUTs straight to R2 so video never transits the API (§14), which
makes the upload cross-origin — and **a new R2 bucket allows no origins at
all**. Without this the browser blocks the request before sending it and the
upload fails with `TypeError: Failed to fetch` and no status code to diagnose.

The policy lives in [`r2-cors.json`](./r2-cors.json). Apply it with:

```bash
pnpm r2:cors          # apply
pnpm r2:cors:check    # print what the bucket currently has
```

The app's own R2 token is object-scoped and will get `AccessDenied` — that is
expected. Use an admin R2 token, or paste `r2-cors.json` into
**Cloudflare → R2 → your bucket → Settings → CORS Policy**.

You can confirm the state without a browser:

```bash
curl -i -X OPTIONS "https://<bucket>.<account>.r2.cloudflarestorage.com/anything" \
  -H 'Origin: http://localhost:3001' -H 'Access-Control-Request-Method: PUT'
```

An unconfigured bucket answers `403 Unauthorized — CORS not configured for this
bucket`; a configured one echoes `Access-Control-Allow-Origin`.

**Every origin the app is served from must be listed, and a missing one fails
exactly like no policy at all.** Note the port: this backend takes 3000, so
`next dev` falls back to **3001** — that, not 3000, is the dev origin here. Set
`R2_CORS_ORIGINS` (comma-separated) to override the list per environment without
editing the JSON.

### 2. `public/` must be publicly readable

Object keys are split into two tiers (`src/storage/storage.keys.ts`):

- `public/avatars/…`, `public/academies/…` and `public/blog/<post>/…` — the
  faces an account chose to publish, and blog covers. Served straight from the
  CDN origin: cacheable, hotlinkable, no signature and no expiry.
- `private/players/…` — player clips and their cover frames, plus the §12.1 age
  and identity documents. Reachable **only** through a signature this API mints
  per read, so removing the row genuinely ends access.

The split is the difference between a thumbnail somebody chose as their avatar
and a minute of video of a child at a training ground. A permanent public address
for the second is an address nobody can revoke: once it is in a message, a cache
or a scraper's index, deleting the row does not take it back.

The prefix is also what picks the bucket. `StorageService` routes on it, so a
key's tier decides where the object is written *and* where it is read from:

| Prefix     | Bucket             | Holds                              | Reached by            |
| ---------- | ------------------ | ---------------------------------- | --------------------- |
| `public/`  | `R2_PUBLIC_BUCKET` | avatars, academy imagery, blog covers | `R2_PUBLIC_BASE_URL`  |
| `private/` | `R2_PRIVATE_BUCKET` | clips, cover frames, §12.1 docs    | presigned URL, 7 days |

Two rules follow, and getting either wrong fails quietly:

- **One API token must be authorized for both buckets.** A token scoped to one
  fails only on uploads touching the other, which presents as "avatars are
  broken", not as a permissions error.
- **`R2_PUBLIC_BUCKET` and `R2_PUBLIC_BASE_URL` must name the same bucket.** If
  the host serves a bucket the app never writes to, every upload succeeds, every
  URL is well-formed, and every image 404s — with nothing in the logs, in a UI
  that falls back to initials when an avatar is missing.

`R2_PUBLIC_BUCKET` may be left empty, which falls back to `R2_PRIVATE_BUCKET` and puts
both tiers in one bucket. That still works, but then the prefix is only a
declaration and the bucket has to enforce it: **public read access scoped to
`public/`**, not on the bucket as a whole. Left open, `private/players/…` is
anonymously fetchable at `R2_PUBLIC_BASE_URL` whatever the code intends.

`pnpm r2:check` verifies all of it against the real buckets — it writes a probe
object to each tier, fetches both back over the public host, confirms the public
one is served and the private one is not, and deletes them. Run it after changing
any R2 setting; it is the only thing that catches a mismatch, because every
individual piece of configuration looks fine on its own.

**`R2_PUBLIC_BASE_URL` is needed for the public tier only** — avatars and academy
imagery. Clips and their covers are served by presigned URL against the S3
endpoint, so they work with nothing but the R2 credentials: no public bucket
access, no custom domain. Without the base URL, avatars resolve to `null` and
fall back to initials, and `buildPublicUrl` throws outright if ever handed a
`private/` key, which is what stops a clip acquiring a permanent address by
accident.

Clip URLs carry the seven-day SigV4 maximum and are re-minted on every read, so a
clip stays reachable for as long as it exists — deletion, not time, ends it. The
signing timestamp is rounded to the hour so the URL is byte-identical within that
window and a rewatch comes from the browser cache instead of the network.

## Social sign-in (Google, Telegram)

Both buttons sign in and register in one press: the API is handed a verified
identity and decides for itself whether it already knows the account. There is no
separate "register with Google" call, because whether this is a first visit is
not something the client can know.

**Google** — the browser gets an ID token from Google Identity Services and posts
it to `POST /auth/oauth/google`. `GoogleOAuthService` fetches Google's published
signing keys, checks the token's RS256 signature against the one its `kid` names,
and only then reads the claims; `aud` must equal `GOOGLE_CLIENT_ID`, or a token
minted for any other site — trivially obtained by running one — would be accepted.
Tokens whose `email_verified` is false are refused outright: matching an existing
account on an address Google has not confirmed would hand that account to whoever
asked for it. Verified against the JWKS directly rather than by adding
`google-auth-library`, since Node builds a public key from a JWK unaided.

**Telegram** — the Login Widget signs rather than tokenises. It hands the browser
a plain object and an HMAC; `verifyTelegramAuth` recomputes that HMAC with
`SHA256(TELEGRAM_BOT_TOKEN)` as the key and rejects anything that does not match,
plus anything older than a day or dated in the future. Every field is hashed,
including ones this code does not recognise, so nothing can be added or edited in
transit. Ten unit tests cover it, which matters more than usual: a mistake in that
file is an authentication bypass, not a wrong answer.

### Telegram identifies by id, not phone number

**The Login Widget does not disclose a phone number.** It sends an id, a name, a
username and a signature; the number is only obtainable by asking inside a chat,
which a login button is not. So `User.telegramId` is what a returning Telegram
user is recognised by.

The consequence is worth stating plainly, because it is a product decision and not
an oversight: somebody who registered with a phone number and later presses
"Continue with Telegram" gets a **second account**, since nothing in the payload
connects the two. Joining them needs a deliberate "connect Telegram" action from
inside a signed-in session — a different feature from signing in, and one worth
building before this is advertised to people who already have phone accounts.

Google has no such gap: the email in a verified token is the same email a password
account was registered with, so the accounts converge on their own.

### Setup

Neither provider works until it is configured, and each button simply does not
render without its variable — a dead button that fails on press is worse than one
that was never offered.

| Where | Variable | From |
| ----- | -------- | ---- |
| backend | `GOOGLE_CLIENT_ID` | Cloud Console → Credentials → OAuth client (Web) |
| client | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | the same value |
| backend | `TELEGRAM_BOT_TOKEN` | @BotFather — **secret** |
| client | `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | the bot's @name, without the @ |

Two settings live outside this repo and fail confusingly when missed: the Google
client needs every serving origin under **Authorised JavaScript origins**, and the
bot needs `/setdomain` sent to @BotFather for the site the button is on. Neither
produces a useful error — Google declines to render, and Telegram's widget simply
does not appear.


## Business logic implemented in full

- **RBAC** (1.4): `users/roles/permissions/user_roles/role_permissions`
  tables + `RolesGuard`/`PermissionsGuard`, both driven by claims embedded in
  the JWT at login/refresh (`RbacService.getEffectiveAccess`).
- **Scout Reputation** (1.5): `computeSuccessRate` / `computeScoutLevel` in
  `recommendations/scout-level.util.ts` implement the exact formula and the
  six level tiers (Observer → Legendary Scout) with their thresholds and
  weights; recalculated on every recommendation creation/acceptance.
- **Recommendation status flow** (1.8): PENDING → ACCEPTED/REJECTED. The
  manager may turn a recommendation down from the inbox; ACCEPTED and the
  trial's REJECTED come from the verdict (`settleTrialBackings`). Reputation is
  recomputed and notifications fired on either.
- **Attribute assessment gating** (1.9, TRIAL.md Rules 21–23): two conditions,
  both checked on every write. The `CoachProfile` must be `VERIFIED`, **and** the
  coach must share an `AcademyGroup` with the player — see
  `GroupsService.assertCoachesPlayer`, which also guards a coach's rating of a
  clip. The reserve (`AcademyMember.groupId = null`) qualifies nobody. A trial
  verdict accepts no ratings at all (Rule 22): it takes PASS or FAIL and a note,
  and nothing else. Verifying a coach grants the `coach` RBAC role.
- **Academy creation** (1.10, revised): **admin/super_admin only** — there are
  roughly 50 academies in Uzbekistan, so they are onboarded by the platform team
  rather than self-registered. An optional `managerUserId` names the account that
  will run it and is granted `academy_manager`; the creating admin does not become
  the manager. Admin-created academies start `VERIFIED` (a human already vetted
  them) and the creation is audit-logged.
- **Trial application flow** (1.11, TRIAL.md): a global trial's
  `APPLIED`, or a private trial's `INVITED → CONFIRMED`, then `PASSED`/`FAILED`
  by an assigned coach's verdict on either kind (`TrialsService.recordVerdict`)
  — and `ACCEPTED` on squad
  placement. Age, gender and deadline are checked on application
  (`trial-eligibility.util.ts`). Trials are archived by hand only.
- **Notifications** (1.12): persisted `Notification` rows + realtime push
  over the `notifications` Socket.IO namespace, fired for recommendation
  outcomes, trial invitations/results, squad invitations and verification
  results. Users who linked Telegram also get them from the bot through the
  `telegram-delivery` queue; the operator chat (`TELEGRAM_ADMIN_CHAT_ID`) is
  told when a trial is announced and when a player joins an academy. Outside
  production **every** Telegram message goes to that chat tagged `#DEV_ENV`
  (and is dropped if it is unset), so development never messages real users.
- **Moderation** (1.13): reports against users/media/academies/coaches,
  admin resolution, optional media takedown.
- **Video processing** (1.7, §14): the browser PUTs the original straight to
  R2; `MediaProcessor` transcodes it with ffmpeg into a temporary key and, only
  on success, copies the result over the same `storageKey` and extracts a
  poster. `status` tracks that pipeline (`PROCESSING → ACTIVE`, or `FAILED`),
  a stale-processing sweep re-queues clips stuck longer than
  `MEDIA_PROCESSING_STALE_MINUTES`, and admins can press **Retry processing**
  on a `PROCESSING`/`FAILED` clip (`PATCH /moderation/media/:id/retry`, same queue).
- **Video review before publication** (1.7): every clip also carries
  `Media.moderationStatus`, defaulting to `UNVERIFIED`. **Visibility is decided
  by moderation alone**: a clip is public exactly when
  `moderationStatus = VERIFIED`. `status` (`PROCESSING`, `ACTIVE`, `FAILED`) is
  the worker's report on the bytes and has no say in who may watch — a verified
  clip stays up while it is being re-encoded and after a failed attempt (the
  original stays under the same key); an unverified or blocked one is never
  served to anyone but its uploader and the moderation queue, however far
  processing got. `REMOVED` is a delete, not a state, and is the only value of
  `status` any visibility query names. A flag (`…/flag`) writes `BLOCKED` as
  well as `FLAGGED`, so it hides by the same rule; "make active" lifts both.
  Nothing on the upload path can set it:
  only `PATCH /moderation/media/:id/verify` (admin or super admin) publishes a clip.
  `…/block` takes one down while keeping the row, its ratings and its engagement
  for the moderation record; `DELETE /moderation/media/:id` destroys the row and
  its objects and is **super admin only**, matching the rule that governs deleting
  an account. Transitions are one-way from `UNVERIFIED` and applied with a
  conditional `updateMany`, so two moderators deciding the same clip cannot
  overwrite one another — the second gets a 409 naming what happened. The
  predicates live in `media/media-visibility.util.ts` and every media query in the
  codebase asks its question through them, including the feed's raw SQL. Until a
  clip is verified it is served to exactly one account, its uploader, and signed
  for fifteen minutes rather than seven days so a block takes effect when it is
  pressed.
- **Rating in review, and appeals**: a player no longer rates their own clip —
  uploads land with `rating = null` (a `rating` in the confirm body is accepted
  and ignored for older apps) and the number is put on by a coach or, in the
  queue, by a moderator. `RatingSource` has two values: `VERIFIED` (a coach's
  number) and `RELATIVE` (a moderator's, from `PATCH /moderation/media/:id/rating`
  in review or after an appeal); the migration that retired `SELF` turned every
  old self rating into `RELATIVE`. `…/category` re-files a clip under the skill
  the footage actually shows, dropping any rating. On the card
  (`card-stars.util.ts`) each skill shows the newest **verified** clip by the day
  it was filmed, and the newest clip of any kind only when no coach has rated
  that skill; a verified number counts in full and a relative one for half, the
  weight a self rating used to carry. A player's clips are listed by
  `recordedAt` desc everywhere (`MEDIA_ORDER`), upload time breaking ties.
  The player can dispute a **relative** rating once per open case — a coach's
  verified number is not appealable: `POST /media/:id/appeal` files a
  `RatingAppeal` (PENDING; 409 while one is open) and tells every active super
  admin (`RATING_APPEAL_FILED` in-app, plus a `#rating_appeal` operator alert
  to `TELEGRAM_ADMIN_CHAT_ID`); `GET /media/:id/appeal` reads it back. Only a
  **super admin** answers, from `GET /moderation/appeals` with
  `PATCH /moderation/appeals/:id` — an optional new rating and a note — which
  resolves it and sends the player a `RATING_APPEAL_RESOLVED` notification
  saying whether the number changed.
- **Blog** (`blog/`): public `GET /blog/home|posts|categories|posts/:slug|sitemap`
  return published posts only; drafts 404 everywhere. Posts are Markdown,
  rendered to sanitised HTML on save (`blog-markdown.util.ts`), with a slug made
  from the title (`blog-slug.util.ts`: lowercase Latin, Cyrillic transliterated,
  unique, admin-editable, never rewritten by a later title change), SEO fields
  (seoTitle, metaDescription, keywords, canonical, OG) and one like per user
  per post (`POST/DELETE /blog/posts/:slug/like`). A YouTube address alone on a
  line renders as the privacy-enhanced player; no other iframe survives the
  sanitiser. Body images: `/blog/admin/posts/:id/images` lists, confirms
  (after the presigned PUT — the object must exist and be an image) and
  deletes `BlogPostImage` rows under `public/blog/<post>/`; deleting the post
  removes them. `GET /blog/spotlight` draws
  six public players and six verified academies at random for the article
  sidebar — age band, never a birth date. `/blog/admin/*` is
  `admin`/`super_admin` only: drafts, publish/unpublish (the first publish date
  is kept), categories, and presigned cover/OG uploads under `public/blog/<post>/`.
- **Second decisions on clips** (1.13): the queue's verify/block are first
  decisions and stay terminal. From the status lists an admin may `restore` a
  FLAGGED clip to ACTIVE or `remove` it (REMOVED, row and trail kept), and a
  super admin may `block-active` a live verified clip or `unblock` a blocked
  one (`PATCH /moderation/media/:id/{restore,remove,block-active,unblock}`).
  Each is conditional on the row still being in the state the admin saw and
  audited under its own key.
- **Messages to users** (`POST /admin/messages`, `GET /admin/messages/chats`,
  `GET /admin/messages/chats/:userId`): an admin writes to one user; the user
  receives it as an `ADMIN_MESSAGE` notification (in-app, socket, Telegram if
  linked). One-way by design — replies come through support requests. The
  history is one row per recipient with the last message and a count, paged;
  the client shows it from a floating button for accounts acting as admin.
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
  and role-permission changes, report resolution and media takedown, and each
  video-moderation decision (`media.verified` / `media.blocked` / `media.deleted`,
  each carrying `previousStatus` and `newStatus`).

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
cp .env.example .env        # fill in DATABASE_URL and DIRECT_URL at minimum
npm install
npm run prisma:migrate      # creates tables
npm run seed                # default roles + a super_admin bootstrap account
npm run start:dev
```

API is served under `/api/v1`. WebSocket notifications connect to the
`/notifications` namespace with `{ auth: { token: <accessToken> } }`.

### Managed Postgres and Redis in production

Nothing in the application changes for either — both are ordinary Postgres and
ordinary Redis over the wire. What changes is which endpoint each URL names, and
both providers hand you the wrong one first.

**Neon** gives one `DATABASE_URL`, against the `-pooler` host. That is the right
endpoint for the running API — many short-lived queries, which is what a
transaction-mode pooler is for — and the wrong one for migrations. `migrate
deploy` takes an advisory lock to stop two deploys migrating at once, and an
advisory lock has to outlive a single transaction to mean anything. So:

```bash
DATABASE_URL="postgresql://…@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://…@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"   # no -pooler
```

Neon labels the second `DATABASE_URL_UNPOOLED` and comments it out with a note
that it is only needed below Prisma 5.10. Set it regardless: it is free at
runtime, since `directUrl` is read by the CLI and never by the running client,
and `DIRECT_URL` is required by the schema in any case.

**Upstash** shows `UPSTASH_REDIS_REST_URL` and a REST token, and a snippet using
`@upstash/redis`. Do not use either here. That client speaks HTTP
request/response, and this app's queue is built on blocking commands — a BullMQ
worker holds `BZPOPMIN` open on a live socket until a job arrives, which HTTP
cannot express. Installing it would leave clips stuck in `PROCESSING` forever.

Use Upstash's **TCP** endpoint instead, which is plain Redis and needs no code
change. The REST token doubles as the password:

```bash
REDIS_URL="rediss://default:<UPSTASH_REDIS_REST_TOKEN>@<name>.upstash.io:6379"
```

`rediss://` (two s) is TLS, which Upstash requires; ioredis reads the scheme and
configures itself. Worth knowing that Upstash bills per command and a BullMQ
worker polls whether or not there is work, so an idle queue is not a free queue.
Measured idle, per API instance: each of the four workers issues two commands a
minute (one `EVALSHA`, one 60-second `BZPOPMIN`), about 12,000 a day for all four.
One rule keeps it there: **never leave a delayed job sitting in a queue** — a
repeatable job scheduler, say. BullMQ caps a worker's wait at ten seconds while
its queue holds a delayed job, whatever `drainDelay` says, which is six wakes a
minute and ~520,000 commands a month from one idle worker. That is why the
stale-media sweep is a timer with a `SET NX` lock and not a queue scheduler.

Then **turn eviction off** — Upstash → Database → Configuration → Eviction. New
databases default to `optimistic-volatile`, and BullMQ says so at boot:

```
IMPORTANT! Eviction policy is optimistic-volatile. It should be "noeviction"
```

It is worth doing rather than silencing. A cache may drop keys under memory
pressure because everything in it can be rebuilt; a queue holds the only record
that work is outstanding, and an evicted job is a clip that stays `PROCESSING`
for ever with nothing to say why. It cannot be set from code — Upstash refuses
`CONFIG SET maxmemory-policy`.

### Development stays local

`backend/.env` points at the docker-compose Postgres and Redis and should keep
pointing there. Production credentials in the file a dev run loads means one
stray `prisma migrate dev`, seed, or test reaches the real database — and the
damage is done before the mistake is noticed.

Production values belong in the host's own environment (Render, Railway, Fly, a
systemd unit). `backend/.env.production` is a gitignored reference copy of them;
nothing loads it. For a one-off command against production, pass the variables
explicitly instead of editing `.env`:

```bash
DATABASE_URL="…-pooler…" DIRECT_URL="…" npx prisma migrate deploy
```

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

Unit specs sit beside the code (`*.spec.ts`, ~70 suites): pure utils
(reputation, eligibility, slugs, storage keys, media visibility, ffmpeg
argument building) and services run against small hand-written Prisma/Redis
fakes — trials, recommendations, media moderation and processing, storage,
blog, auth helpers. No infrastructure is needed and the whole run takes well
under a minute. There is no e2e suite yet; one would live under `test/`
against the docker-compose Postgres (`CLAUDE.md` §5).

Toolchain: Node 20+ (22 in use). `pnpm lint` runs `eslint .`; the `eslint`
binary is not a direct devDependency, so under pnpm's strict layout it may
report `eslint: not found` — add it before relying on the script.

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

Schema changes are new migrations (`pnpm prisma:migrate` against the dev
database), committed together with the `schema.prisma` change. Existing SQL
under `prisma/migrations/` is history and is never edited.

## Deployment: migrations run on boot

`start` and `start:prod` run `prisma migrate deploy` before the API listens.

This is here because forgetting it broke production twice: code that reads a new
column shipped while the database still had the old shape, and every request
touching that table answered 500. The symptom is never obvious from the outside
— "column does not exist" surfaces as a generic server error on whichever screen
happens to touch it first.

`migrate deploy` is idempotent and takes an advisory lock, so several instances
booting at once is safe; that lock is also why `DIRECT_URL` must point at the
unpooled endpoint (see the datasource note in `schema.prisma`).

A migration that fails now stops the API from starting. That is deliberate: a
service that will answer 500 for every request touching the changed table is
worse than one that visibly did not come up.

`start` and `start:prod` are identical for this reason: whichever one a
platform picks, the schema is current before the first request. Cloud Run's
buildpacks run `start`; Render is configured with `start:prod`.

Two things this depends on, both of which have broken a deploy before:

- **`prisma` is a runtime dependency, not a dev one.** Buildpacks ship only
  `dependencies` to the runtime image, so a devDependency CLI is absent exactly
  where this needs it — the container then exits before it can listen, which
  Cloud Run reports as "failed to start and listen on the port", naming nothing
  about Prisma.
- **`DIRECT_URL` must be set wherever the app runs**, not only where migrations
  used to be run by hand. `migrate deploy` takes an advisory lock that has to
  outlive a transaction, which a pooled connection cannot hold — see the
  datasource note in `schema.prisma`.

The scripts call `prisma` directly rather than through `pnpm run`, because the
runtime image is not guaranteed to have pnpm on its path.

### `pnpm seed` is a one-off, not part of the boot

Do not put it in the start command. It was there once, and on a free instance
that spins down it meant a `ts-node` compile and an argon2 hash in front of
every cold start, paid by whoever made the first request after an idle period.

Nothing it writes needs to happen more than once:

- **Roles** are ensured on boot by `RbacService.onModuleInit`.
- **Tariff plans** are ensured on boot by `TariffsService.onModuleInit`.
- **The bootstrap super admin** is the only thing left, and a database only
  needs one. Run `pnpm seed` by hand against a brand-new database, once.
