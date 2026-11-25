# Three Bells: agent guide

Navy Reserve RMP hour tracker. Express 5 + Prisma 7 (PostgreSQL), server-rendered HTML
enhanced with htmx, deployed as one Vercel serverless function. CommonJS.

There is no build step today; the code runs straight from source. That's a description,
not a rule: if one becomes necessary, add a `build` script to `package.json` (Vercel runs
it on every deploy) and make sure local dev and `npm test` still work.

## Commands

- `npm run checks` (lint + format check + unit tests) runs in the pre-commit hook and CI;
  run it before committing. Unit tests need no database.
- User-facing changes need a changeset: `npm run changeset` (or add a file to `.changeset/`).

## Conventions that aren't obvious from the code

- **Vendored files:** never edit anything in `public/vendor/` (pinned third-party builds).
- **URLs:** pages live at `/` and `/changelog`. Actions and auth live under `/api/...`.
  `/api` and `/api/changelog` only redirect for old bookmarks. Keep the OAuth callback at
  `/api/auth/callback`, since it is registered in Google Cloud Console. Keep the manifest
  `id` as `/api`, since changing it gives installed PWAs a new identity.
- **Mutations answer two ways** (see `respond()` in `routes/app.js`). For htmx requests,
  return the changed regions (`renderRegions`) as out-of-band swaps plus an optional toast,
  with `HX-Reswap: none`. For plain form posts, redirect to `/`. Keep forms working without JS.
- **Validation errors:** throw `ValidationError` (its message is shown to users). For htmx
  forms, re-render the form with status 422, which htmx is configured to swap. Other
  errors go out as `text/plain` and show up as a toast.
- **Client events after a response:** use `HX-Trigger-After-Settle`, not `HX-Trigger`.
  `HX-Trigger` fires before the swap, and a handler that replaces the requesting element
  cancels the whole swap.
- **Times are UTC wall-clock values:** what the user typed, stored as UTC. Always parse and
  format with the helpers in `lib/time.js`, never with server-local `Date` methods or
  `toLocale*`. The browser provides "today" (inputs with `data-today`) and timer times.
- **Security:** escape every interpolated value with `escapeHtml` (imported as `h`). The CSP
  forbids inline scripts, so put behaviour in `public/app.js`. Mutating routes need
  `requireAuth` and `requireCSRF`. htmx sends the token as `X-CSRF-Token` via `hx-headers`
  on `<body>`.
- **Static assets:** reference files in `public/` through `assetUrl()` for content-hashed
  URLs. The service worker caches `?v=` URLs cache-first.
- **Elements that persist across swaps** need stable ids. Log rows and RMP cards also need a
  unique `view-transition-name`. `app.js` keeps the scroll position anchored to elements by id.

## Prisma

On Prisma 7 with the classic `prisma-client-js` generator, which keeps plain
`require("@prisma/client")` working in this CommonJS, no-build project.

- `prisma.config.ts` holds the CLI's database URL. It reads `DATABASE_URL` optionally on
  purpose: `prisma generate` runs on every `npm install` (postinstall), including CI jobs
  with no database. Don't switch it to Prisma's `env()` helper, which throws when the
  variable is unset and would break those installs.
- The app connects through the `@prisma/adapter-pg` driver adapter (`lib/db.js`), not a
  schema `url`.
- **Don't upgrade to Prisma 8 yet**, and pin exact versions when upgrading: npm's `latest`
  tag has pointed at 8.x release candidates. Moving to 8 will likely mean switching to the
  newer `prisma-client` generator, which outputs TypeScript and so needs a build step or
  TypeScript support. Close Dependabot PRs for 8 until that's planned.
