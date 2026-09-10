@AGENTS.md

# CLAUDE.md — client (Next.js frontend)

Read [`../CLAUDE.md`](../CLAUDE.md) first for repo-wide rules, and **always** read `AGENTS.md`
(imported above): this is Next **16.2.12** / React **19.2.4**, and several APIs differ from older
training data (`proxy.ts` instead of `middleware.ts`, async `params`/`searchParams`/`cookies()`,
no `next lint`). Check `node_modules/next/dist/docs/` before assuming a pattern still applies.

## 1. Current state

A full product: guest landing, auth (email, phone OTP, Google, Telegram, forgot/reset, forced
password set), first-login role discovery, player onboarding, role-aware dashboards, player
search and profiles, clip upload/feed/moderation, academies with squads/groups/invitations,
scouts and recommendations, trials (global and private, verdicts, squad candidates), notifications
(HTTP + Socket.IO), settings and sessions, an admin area, a public blog, legal pages, and full
i18n (uz · ru · en). What is still not built is listed in [`README.md`](./README.md).

## 2. Architecture

- **App Router, Server Components by default.** `'use client'` only for a leaf that needs state,
  browser APIs or TanStack Query, pushed as far down the tree as possible. A page is a Server
  Component that renders small client islands (`LikeButton`, `ApplyToTrialButton`).
- **Route groups**: `(auth)` has no app chrome; `(app)` is the shell (header, role switcher,
  nav) and is **also reachable by guests** for public pages (players, academies, trials, blog).
  `proxy.ts` redirects unauthenticated traffic only for `PROTECTED_PREFIXES` (dashboard, profile,
  settings, notifications, recommendations, my…) with `?next=` so login returns them.
- **Sessions**: the backend's access + refresh tokens live in **httpOnly cookies** set by route
  handlers under `app/api/auth/*` (login, refresh, logout, active-role, onboarded…). Nothing
  auth-related is in `localStorage` or Zustand. Server code reads the session with
  `getSession()` (`lib/session.ts`); client code reads `useSession()` from `SessionProvider`
  (roles, active role, `isAuthenticated`). `useRequireAuth()` gates guest-visible actions
  (like, follow, apply) and sends a guest to `/login?next=<here>`.
- **Data fetching**: Server Components call the API directly with `apiFetch` from
  `lib/api/client.ts` (pass `{ token }` for personal reads with `cache: 'no-store'`; public reads
  use `{ revalidate }`). Client Components call `browserFetch` (`lib/api/browser.ts`), which goes
  through `/api/proxy/*` so the token never reaches JS and a 401 triggers **one shared** refresh
  per tab (the backend revokes a session on refresh-token replay). Interactive data lives in
  TanStack Query; `useInfiniteQuery` for "Load more" lists.
- **Active role** is a view preference (README §1.2.1), kept in a readable `fs_active_role`
  cookie and sent as `X-Active-Role`; every real permission check happens in the backend.
- **i18n**: dictionaries in `lib/i18n/dictionaries/{uz,ru,en}.ts`; `uz.ts` defines the
  `Dictionary` type, so a key added there must be added to the other two. Server: `getServerT()`;
  client: `useI18n()` → `{ t, f }`. No hardcoded user-facing strings.
- **SEO**: `pageMetadata`, `absoluteUrl`, `jsonLd` (`lib/seo.ts`) and the JSON-LD builders in
  `lib/structured-data.ts` (organization, breadcrumb, person, event, item list); `app/sitemap.ts`
  and `app/robots.ts`. Public pages export `generateMetadata`; article-style pages add Article
  JSON-LD. `(app)/loading.tsx` streams the shell first, so `notFound()` renders the not-found
  view with `noindex` under a 200 — the same for every page in the shell.
- **Errors**: `ApiError` from the wrappers; `global-error.tsx`, `not-found.tsx`, per-route
  `loading.tsx` where the wait is noticeable; Sentry is configured (`sentry.*.config.ts`).

## 3. Layout

```
app/
├── layout.tsx  page.tsx  globals.css  sitemap.ts  robots.ts  not-found.tsx  global-error.tsx
├── (auth)/login  register  forgot-password        # no app chrome
├── welcome/  onboarding/player/                   # first-login role + player wizard
├── (app)/                                         # shell: AppHeader, footer, guest-tolerant
│   ├── dashboard/  feed/  players/[id]  academies/[id]  trials/[id]  scouts/
│   ├── recommendations/  invitations/  groups/  notifications/  profile/  settings/
│   ├── blog/  blog/[slug]                         # public
│   └── admin/ {users, admins, roles, academies, moderation, requests, audit-logs, tariff-plans, blog}
├── api/auth/*  api/proxy/[...path]  api/legal/    # route handlers only for cookie/proxy work
└── contact-us/  privacy/  terms/
components/
├── ui/          # hand-written primitives (Button, Card, Field, Badge, Dialog, Drawer, LoadingImage…)
│                # — NOT shadcn output; edit directly (see components/ui/README.md)
├── layout/      # AppHeader, nav.ts (menus per role), Providers, SessionProvider, I18nProvider
├── shared/  player/  academy/  trials/  blog/  auth/  landing/  legal/
lib/
├── api/         # client.ts (server apiFetch), browser.ts (browserFetch), resources.ts (every
│                # endpoint, typed), types.ts (mirrors backend DTOs by hand), upload.ts
├── i18n/  schemas/ (Zod: auth, player)  session.ts  roles.ts  seo.ts  structured-data.ts
└── <topic>.ts   # pure helpers (player-card, trial-window, media-url, social-links, blog…)
hooks/           # useRequireAuth, useNotificationSocket, useWindowedList
proxy.ts         # route protection + x-pathname header
```

## 4. Conventions

- Default exports only for Next route files (`page`, `layout`, `loading`, `error`,
  `not-found`); everything else is a named export. Client islands live beside their route unless
  reused by two or more routes.
- Components PascalCase `.tsx`; hooks `useX.ts`; route folders kebab-case; Zod schemas
  `xSchema`; API wrappers grouped per resource in `lib/api/resources.ts` (`blog.bySlug`,
  `trials.apply`) — no raw `fetch('/api/v1/...')` in components.
- Tailwind v4 is CSS-first: tokens in `app/globals.css` `@theme`, light and dark via
  `prefers-color-scheme` plus `[data-theme]`. No `tailwind.config.ts`. `body` keeps
  `overflow-x: hidden`; wide content scrolls inside its own container.
- Forms: React Hook Form + Zod where there is more than a field or two; simple editors may use
  local state. Mutations surface errors through `onError` and a toast (`sonner`), never a throw
  in an event handler.
- Design constraints from the product (README §14, §21): entry-level Android on metered data —
  no autoplay, poster frames, large touch targets, real focus states, layouts that hold on a small phone.
- Images from R2 go through `LoadingImage` (plain `<img>`; the R2 host is not in
  `images.remotePatterns`). Uploads go straight to R2 with `uploadToStorage` and a presigned URL
  from the API.

## 5. Testing

`node:test` specs sit beside some `lib/` modules (`*.spec.ts`), but no runner script is wired and
`tsx` is not installed, so they are not currently runnable from `package.json`. The checks that
exist: `npm run typecheck`, `npm run lint`, `npm run build`, and driving the app in a browser
against a local API. Don't claim client tests pass until a runner is added; when adding one,
prefer Vitest + Testing Library for components and Playwright for e2e.

## 6. Never change without sign-off

- `AGENTS.md` and its import at the top of this file.
- Exact pins of `next`, `react`, `react-dom` in `package.json`.
- Tailwind v4 CSS-first config in `globals.css`.
- The cookie-based session design (`app/api/auth/*`, `/api/proxy/*`); tokens never reach JS.
- `uz.ts` as the source of the `Dictionary` type.
