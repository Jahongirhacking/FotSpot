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
├── layout.tsx                  # root: fonts, providers, theme
├── page.tsx                     # guest landing
├── (auth)/                      # login · register — no app chrome
├── welcome/                     # first-login role discovery (README §1.2.2)
├── (app)/                       # authenticated shell: header, role switcher, nav
│   ├── dashboard/                # role-aware home (README §1.2.1)
│   ├── players/                  # search + [id] public profile
│   ├── academies/  trials/  recommendations/  notifications/  settings/
│   └── onboarding/player/        # age-gated player profile wizard (README §11.1)
└── api/auth/                     # route handlers that set httpOnly session cookies
components/
├── ui/                           # primitives (button, card, input, dialog, …)
└── player/  layout/  …            # domain components — PlayerCard lives here
lib/
├── api/                          # one typed wrapper module per backend resource
├── schemas/                      # Zod, one per backend DTO
├── stores/                       # Zustand (client-only UI state)
└── roles.ts                      # active-role priority + persistence helpers
proxy.ts                          # route protection (Next 16 renamed middleware → proxy)
```

### Auth & sessions

The backend issues a short-lived access token plus a rotating, device-bound refresh token
(`../README.md` §1.21). The client keeps **both in httpOnly cookies set by Next route handlers**
under `app/api/auth/` — never in `localStorage`, which is readable by any injected script.

- `POST /api/auth/login` → calls the NestJS API, sets `fs_access` + `fs_refresh` httpOnly cookies.
- `POST /api/auth/refresh` → rotates. Called by the server-side fetch wrapper on a 401.
- `POST /api/auth/logout` → revokes server-side and clears cookies.

`proxy.ts` guards authenticated route groups and redirects unauthenticated users to `/login`
with a `next` parameter so they land where they were going.

### Active role

Per `../README.md` §1.2.1 the active role is a **view preference, never a permission**. It is
persisted in a non-httpOnly `fs_active_role` cookie (readable during server render so the first
paint is correct) and is **deliberately not cleared on logout** — that is the requirement. On read
it is validated against the roles the user actually holds now, falling back by the priority order
in `lib/roles.ts`. Every real authorization decision happens in the backend guards.

> Long term this belongs on the user record (`users.last_active_role`) so it follows the account
> across devices. The backend has no such column yet, so the cookie is the current implementation
> and it is per-device. Adding the column is the only change needed to make it cross-device.

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

Built: guest landing · login/register (email + phone OTP) · first-login role discovery · age-gated
player onboarding · role-aware dashboards · role switcher · PlayerCard · player search and profile ·
academies · trials + apply · recommendations (create, mine, ranked academy inbox) · notifications ·
session/device management.

Not built: guardian consent enforcement (§11 — a launch blocker on the backend too), Combine and
Player Index (§13), i18n message extraction (§14 — copy is currently English-only), Telegram
surface, offline trial-day mode, tests (`CLAUDE.md` §9 specifies Vitest + Playwright).
