# components/ui — hand-authored primitives

> **These are not shadcn-generated files.** `client/CLAUDE.md` §4/§10 says files in this directory
> are generated artifacts that must be regenerated rather than hand-edited. That rule applies to
> shadcn CLI output — but no shadcn CLI was ever run in this project (it would have wanted to write
> a `tailwind.config.ts`, which §10 forbids under Tailwind v4's CSS-first config).
>
> Everything here is **app-owned code**: hand-written, deliberately minimal, styled against the
> design tokens in `app/globals.css`. Edit these files directly.
>
> If you later adopt the shadcn CLI, treat that as a migration: generate into a fresh directory,
> reconcile token names, and delete these. Don't let CLI output and these coexist under the same
> filenames — that is exactly the confusion §10 is trying to prevent.

Each primitive keeps the shadcn _API shape_ (a `cn()`-merged `className`, `variant`/`size` props via
`class-variance-authority`, `asChild`-free composition) so that a future migration is mechanical.
