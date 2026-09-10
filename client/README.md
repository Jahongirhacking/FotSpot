# FotSpot — client

Next.js frontend for the FotSpot football talent platform. Product spec:
[`../README.md`](../README.md). Engineering rules: [`CLAUDE.md`](./CLAUDE.md) and
[`AGENTS.md`](./AGENTS.md) — **read `AGENTS.md` before writing any Next.js code**, this is
Next 16.2.12 and several APIs differ from older versions.

## Requirements

|                 |                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Node**        | **≥ 20.9** — Next 16 dropped Node 18. `nvm use 22` if your default is older.                                                |
| Package manager | `npm` (both `package-lock.json` and `pnpm-lock.yaml` are checked in; use whichever your team settled on, don't add a third) |
| Backend         | The NestJS API from [`../backend`](../backend) running on `:3000`                                                           |

## Getting started

```bash
nvm use 22                # Next 16 requires Node >= 20.9
npm install
cp .env.example .env.local
npm run dev               # http://localhost:3001
```

The API base URL is read from `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:3000/api/v1`).
The dev server runs on port 3001 so it doesn't collide with the backend on 3000.

```bash
npm run build             # production build (Turbopack, default in Next 16)
npm run start
npm run lint              # eslint directly — `next lint` was removed in Next 16
npm run typecheck
```

## Architecture at a glance

```
app/
├── layout.tsx  page.tsx          # root providers · guest landing
├── (auth)/                       # login · register · forgot-password — no app chrome
├── welcome/  onboarding/player/  # first-login role discovery (§1.2.2) · player wizard
├── (app)/                        # app shell (header, role switcher, nav); public pages are
│   │                             # reachable here as a guest, protected ones redirect to login
│   ├── dashboard/  feed/  players/  academies/  trials/  scouts/  recommendations/
│   ├── invitations/  groups/  notifications/  profile/  settings/  playing-styles/
│   ├── blog/  blog/[slug]         # public blog with SEO metadata, JSON-LD and sitemap entries
│   └── admin/                    # users · admins · roles · academies · moderation · requests ·
│                                 # audit logs · tariff plans · blog (ADMIN / SUPER_ADMIN)
├── api/auth/  api/proxy/         # route handlers: httpOnly session cookies, token-attaching proxy
├── sitemap.ts  robots.ts         # SEO
└── contact-us/  privacy/  terms/
components/
├── ui/                           # hand-written primitives (see components/ui/README.md)
├── layout/                       # AppHeader, nav per role, Session/I18n providers
└── player/ academy/ trials/ blog/ shared/ auth/ landing/ legal/
lib/
├── api/                          # client.ts (server fetch), browser.ts (client fetch via proxy),
│                                 # resources.ts (every endpoint), types.ts (mirrors backend DTOs)
├── i18n/                         # uz · ru · en dictionaries; uz defines the Dictionary type
├── schemas/                      # Zod (auth, player)
└── seo.ts  structured-data.ts  session.ts  roles.ts  …  # pure helpers
hooks/                            # useRequireAuth, useNotificationSocket, useWindowedList
proxy.ts                          # route protection (Next 16 renamed middleware → proxy)
```

### Auth & sessions

The backend issues a short-lived access token plus a rotating, device-bound refresh token
(`../README.md` §1.21). The client keeps **both in httpOnly cookies set by Next route handlers**
under `app/api/auth/` — never in `localStorage`, which is readable by any injected script.

- `POST /api/auth/login` → calls the NestJS API, sets `fs_access` + `fs_refresh` httpOnly cookies.
- `POST /api/auth/refresh` → rotates. Client requests go through `/api/proxy/*`, which attaches
  the token and refreshes **once per tab** on a 401 — the backend treats a second use of a
  rotated refresh token as a replay and revokes the session.
- `POST /api/auth/logout` → revokes server-side and clears cookies.

`proxy.ts` guards the authenticated prefixes and redirects to `/login?next=…`; public pages
(players, academies, trials, blog) render for guests, and guest-visible actions (like, follow,
apply) send them to login through `useRequireAuth()`.

### Active role

Per `../README.md` §1.2.1 the active role is a **view preference, never a permission**. It is
persisted in a non-httpOnly `fs_active_role` cookie (readable during server render so the first
paint is correct) and is **deliberately not cleared on logout** — that is the requirement. On read
it is validated against the roles the user actually holds now, falling back by the priority order
in `lib/roles.ts`. Every real authorization decision happens in the backend guards.

> The cookie is per-device. Moving it to the user record would make it follow the account across
> devices; nothing else would need to change.

### Data fetching

Server Components `fetch` public endpoints directly (player search, public profiles, academy
listings, upcoming trials) so there is no client waterfall. Authenticated and interactive data goes
through TanStack Query inside Client Components. See `CLAUDE.md` §2 and §6 — this split is
deliberate, not incidental.

## Design system

Tokens live in `app/globals.css` as a Tailwind v4 `@theme` block (CSS-first config — there is
deliberately **no `tailwind.config.ts`**, see `CLAUDE.md` §10). Light and dark are both
first-class via `prefers-color-scheme` plus a `[data-theme]` override.

Constraints that come from the product, not from taste (`../README.md` §14, §21.6):

- **Entry-level Android on metered data is the target device.** No WebGL, no 3D, no heavy
  animation libraries. Attribute bars are CSS, the player card is DOM.
- **No video autoplay.** Poster frames, tap to play.
- Large touch targets, real focus states, honest contrast.

## Status

Built: guest landing · login/register (email, phone OTP, Google, Telegram; forced password set
after social sign-in) · first-login role discovery · age-gated player onboarding · role-aware
dashboards and role switcher · PlayerCard, attributes and rating history · clip upload with
client-side processing, feed, engagement and moderation · player search and profiles (social
links; contacts gated to the player's academy) · academies with squads, groups, invitations and
scout trust · scouts and recommendations (create, mine, ranked academy inbox) · trials (global
and private, stage tabs, participants, verdicts, squad candidates) · notifications (in-app,
Socket.IO, Telegram) · settings, sessions and account requests · admin area · public blog with
admin editor · legal pages · uz/ru/en i18n · SEO (metadata, JSON-LD, sitemap) · light/dark theme.

Not built: guardian consent enforcement (§11 — a launch blocker on the backend too), Combine and
Player Index (§13), offline trial-day mode, a client test runner (`node:test` specs exist beside
some `lib/` modules but nothing runs them yet — see `CLAUDE.md` §5).
