@AGENTS.md

# CLAUDE.md — client (Next.js frontend)

Read [`../CLAUDE.md`](../CLAUDE.md) first for repo-wide rules, and **always** read `AGENTS.md`
(imported above) before writing any Next.js-specific code — this pins Next 16.2.12 / React 19.2.4,
both of which have breaking API changes vs. older training data. Check
`node_modules/next/dist/docs/` for the current API before assuming a pattern from an older Next
version still applies.

Since you already know React deeply, this file skips the basics and goes straight to the
project-specific decisions and the App-Router-specific mental model.

## 1. Current state

The app is **freshly scaffolded** (`create-next-app`, App Router, TS, Tailwind v4, ESLint 9 flat
config). Nothing domain-specific has been built yet — `app/page.tsx` is still the default
boilerplate. Everything below is the _target_ architecture per `README.md` §1.16, to apply as
real screens get built.

## 2. Architecture

- **Next.js App Router** (`app/`), not Pages Router. Route segments = folders; `page.tsx` per
  segment; shared chrome in `layout.tsx`.
- **Server Components by default.** Only opt into `'use client'` for a subtree that genuinely
  needs interactivity, browser APIs, or a hook (`useState`, TanStack Query, Zustand, event
  handlers). Push `'use client'` as far down the tree as possible — a page can be a Server
  Component that renders one small Client Component island, not the other way around.
- **Data fetching**: Server Components fetch directly against the NestJS API (`backend/`, prefix
  `/api/v1`) using `fetch` with Next's extended caching options — no client-side waterfall for
  data that's known at request time (e.g. a player's public profile page). Reach for **TanStack
  Query** (per spec §1.16) only inside Client Components for data that changes based on client
  interaction (search-as-you-type, optimistic mutations, polling notifications).
- **Global client state**: **Zustand** (spec §1.16) for genuinely global, client-only UI state
  (e.g. auth token if not using cookies, active filters, modal/drawer open state). Don't reach for
  Zustand for server data — that's TanStack Query's job. Don't reach for either for state that's
  local to one component tree — that's `useState`/`useReducer`.
- **Forms**: **React Hook Form + Zod** (spec §1.16) for every form with more than one field or any
  server-side validation mirror. Define the Zod schema once, derive the RHF resolver from it, and
  reuse the same schema shape as a type import (`z.infer<typeof schema>`) rather than hand-writing
  a parallel TS interface.
- **Auth**: the backend issues JWT access + refresh tokens (`POST /api/v1/auth/*`). Store the
  access token in memory/Zustand for the session; plan for httpOnly-cookie-based refresh once this
  is implemented — don't put the refresh token in `localStorage`.

## 3. Folder structure (target, to be built out as screens land)

```
client/
├── app/
│   ├── layout.tsx              # root layout: fonts, global providers
│   ├── page.tsx                 # landing/guest view
│   ├── (auth)/                  # route group: login, register, otp — no shared UI chrome
│   ├── players/
│   │   ├── page.tsx              # search (Public, matches GET /players/search)
│   │   └── [id]/page.tsx          # public profile (Server Component, matches GET /players/:id)
│   ├── academies/  trials/  recommendations/
│   ├── dashboard/                # authenticated area, role-aware
│   └── api/                      # Next route handlers, ONLY for things that must run on the
│                                  # Next server itself (e.g. setting httpOnly cookies) —
│                                  # everything else calls the NestJS API directly
├── components/
│   ├── ui/                        # shadcn/ui primitives (generated, don't hand-edit — regenerate)
│   └── <domain>/                   # composed, app-specific components (PlayerCard, TrialForm, ...)
├── lib/
│   ├── api/                        # typed fetch wrappers per backend module (players.ts, trials.ts...)
│   ├── schemas/                     # Zod schemas, shared between RHF and (optionally) parsing API responses
│   └── stores/                      # Zustand stores
├── hooks/                            # TanStack Query hooks (usePlayerSearch, useMyRecommendations, ...)
└── AGENTS.md                          # Next-16-specific breaking-change warning — do not remove
```

## 4. Coding standards

- Match the backend's DTO shapes with a **Zod schema per backend DTO** in `lib/schemas/`, kept in
  sync manually (no shared package yet — see root CLAUDE.md, no workspace tooling exists). If a
  backend DTO changes, update the corresponding Zod schema in the same PR.
- No default exports for components except `page.tsx`/`layout.tsx`/`loading.tsx`/`error.tsx` (Next
  requires default exports for these route files). Everything else: named exports.
- Co-locate a route's Client Component islands inside that route's folder
  (`app/trials/[id]/apply-button.tsx`), not in a shared `components/` unless it's reused across
  ≥2 routes.
- Tailwind v4: config is CSS-first (`@import "tailwindcss"`, `@theme inline { ... }` in
  `globals.css`) — there is no `tailwind.config.ts` in this project. Don't add one; extend the
  `@theme` block instead.
- shadcn/ui components in `components/ui/` are generated artifacts — if one needs a change,
  either regenerate via the CLI with new options, or fork it into `components/<domain>/` and treat
  the fork as app code. Don't hand-patch the generated file and expect it to survive a future
  regeneration.

## 5. Naming conventions (client-specific)

| Thing          | Convention                         | Example                                 |
| -------------- | ---------------------------------- | --------------------------------------- |
| Route folder   | kebab-case, matches URL segment    | `app/players/[id]/`                     |
| Component file | PascalCase, `.tsx`                 | `PlayerCard.tsx`                        |
| Hook file      | camelCase, `use` prefix            | `usePlayerSearch.ts`                    |
| Zod schema     | camelCase var, `Schema` suffix     | `createTrialSchema`                     |
| Zustand store  | camelCase, `use...Store`           | `useAuthStore`                          |
| API wrapper fn | verb + noun, matches backend route | `getPlayerById`, `createRecommendation` |
| Route group    | parens, no URL impact              | `(auth)`, `(dashboard)`                 |

## 6. API patterns

- One typed wrapper module per backend resource in `lib/api/` (e.g. `lib/api/trials.ts` exports
  `listUpcomingTrials()`, `applyToTrial(trialId)`), mirroring `TrialsController`'s routes 1:1. Don't
  scatter raw `fetch('/api/v1/...')` calls through components.
- Always target the versioned prefix `/api/v1` — never hardcode a bare path without it.
- Attach the JWT `Authorization: Bearer <token>` header in the wrapper layer, not per call-site.
- Public backend routes (`@Public()` on the NestJS side — player search, public profiles, upcoming
  trials, academy listings) can be fetched from **Server Components** with Next's `fetch` caching;
  everything requiring auth should go through a Client Component + TanStack Query so the token from
  Zustand/cookies is available.
- WebSocket notifications: connect to the `/notifications` Socket.IO namespace with
  `{ auth: { token: accessToken } }`, one connection per authenticated session, managed by a single
  provider near the root layout — don't open a new socket per component.

## 7. Error handling

- Every route segment that fetches data should have a sibling `error.tsx` (Next's error boundary
  convention) — don't rely on a single global error boundary for the whole app.
- Every route segment with async Server Components should have a sibling `loading.tsx` (or a
  `<Suspense>` boundary around the async part) so navigation doesn't block on slow data.
- TanStack Query mutations: surface errors via the mutation's `onError`/`isError`, not by throwing
  inside an event handler — React doesn't have a synchronous error boundary for event handlers.
- RHF + Zod: let Zod's `.safeParse` error messages drive field-level errors; don't hand-write
  parallel validation messages that can drift from the schema.
- Never swallow a fetch rejection silently — if a wrapper in `lib/api/` catches an error, it must
  either re-throw a typed error or return a discriminated-union result the caller is forced to
  handle.

## 8. State management (summary — see §2 for rationale)

| State kind                                                       | Tool                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| Server data (fetched from the API)                               | TanStack Query (client) / direct `fetch` (Server Components)    |
| Global client-only UI state (auth session, filters, open modals) | Zustand                                                         |
| Local component state                                            | `useState`/`useReducer`                                         |
| Form state                                                       | React Hook Form                                                 |
| URL-driven state (search filters, pagination)                    | `useSearchParams` / route params — don't duplicate into Zustand |

## 9. Testing strategy

No test setup exists yet (no Jest/Vitest/Playwright config, no `test` script). When introducing
tests:

- **Component/unit**: Vitest + React Testing Library — Vitest over Jest here since the project has
  no existing Jest config to match (unlike the backend, which should stay on Jest).
- **E2E**: Playwright, run against a locally running `pnpm dev` + the backend's docker-compose
  infra.
- Test Zod schemas directly (`schema.safeParse(fixture)`) — cheap, high-value, no rendering needed.
- Don't snapshot-test shadcn/ui primitives in `components/ui/` — they're generated and not owned
  code; test the app-specific components that compose them instead.

## 10. What should never be changed (client-specific — see also root §7)

- **`AGENTS.md`** and its `@AGENTS.md` import at the top of this file — the Next 16 breaking-change
  warning is load-bearing for correctness, not decorative.
- **Pinned exact versions** of `next`, `react`, `react-dom` in `package.json` (`16.2.12`,
  `19.2.4`, `19.2.4`) — don't bump with a caret/range without deliberately testing against the new
  version; this stack is new enough that patch/minor bumps can carry breaking changes.
- **Tailwind v4 CSS-first config in `globals.css`** — don't reintroduce a `tailwind.config.ts`;
  the two configuration models don't mix cleanly in v4.
- **`components/ui/` generated files** — don't hand-edit; regenerate via shadcn CLI or fork into
  app-owned code as described in §4.
