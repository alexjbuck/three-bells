# three-bells

## 1.8.1

### Patch Changes

- Database and build fixes

  - Postgres connections request `sslmode=verify-full` explicitly, which removes the `pg` SSL security warning from the logs without changing how connections are verified
  - Prisma's install scripts are approved for newer npm versions, so production builds keep downloading the engine migrations need
  - Dependency updates with security fixes: Express 5.3 and its request-parsing libraries (`body-parser`, `qs`, `path-to-regexp`), `express-rate-limit`, the session store, and patched versions of `effect` and `tinypool` in the tooling

## 1.8.0

### Minor Changes

- Redesign the dashboard and stop full-page reloads

  - Every action (log, edit, delete, bundle, mark paid, unsubmit) now updates in place with htmx and keeps your scroll position
  - Edit entries inline in the history list; Escape cancels
  - Undo for deleted entries and payment status changes; a styled confirm replaces browser dialogs
  - New phone-first layout: sticky top bar with the timer, bottom-sheet entry form, floating add button, no more cramped RMP cards
  - History grouped by month with totals; bundled entries link to their RMP
  - RMP cards expand to show their entries and can copy their notes
  - "Bundle all" when more than one RMP is ready
  - Clear "Time range / Manual hours" toggle with a live hours preview and inline validation messages
  - Dark mode, refreshed visual design and icons
  - Fix entry times shifting when the server isn't running in UTC; "today" now uses your local date
  - Split the single 2,400-line server file into routes, views and lib modules; add unit tests
  - Tighter Content Security Policy (no inline scripts)
  - The app now lives at `/` (and the changelog at `/changelog`); old `/api` links redirect

- Add interactive walkthrough tutorial for new users

  - Auto-starts on first visit with skip option
  - Uses Driver.js for guided tour with highlighted elements
  - Covers dashboard, timer, log hours form, RMPs, and history
  - Help button (?) in header to replay tutorial anytime
  - "Show Tutorial" link in profile dropdown
  - Tutorial completion saved in localStorage
  - Custom styling matching app's navy blue theme

### Patch Changes

- Upgrade Prisma from 6.19 to 7.10

  - Database URL for the Prisma CLI moves to `prisma.config.ts`; the app connects through the `@prisma/adapter-pg` driver adapter
  - `prisma generate` still works without `DATABASE_URL`, so installs in CI keep working

- Refresh the app icon

  - New three-bells icon in the app's navy and gold, matching the redesigned UI
  - Fixes the installed-app icon showing on black (the old PNGs lost their background gradient)
  - Proper maskable icon for Android, a 180px Apple touch icon for iOS, and an SVG favicon
  - The header and sign-in page logos now use the app icon

- Security: close an account-takeover hole in the preview-deployment sign-in hand-off

  - The OAuth `state` that carries the return URL is now signed by the deployment that starts sign-in; production ignores unsigned, expired or tampered states instead of redirecting to them
  - Hand-off tokens are bound to the host they were issued for and rejected anywhere else
  - The preview hostname allowlist now anchors the team suffix to the end of the hostname

## 1.7.0

### Minor Changes

- 688dc5b: Add text notes to time records and RMPs

  - Added optional note field to time log entries
  - Notes can be edited while logs are unbundled, locked once bundled into an RMP
  - When bundling logs into an RMP, notes from participating logs are combined and stored on the RMP
  - Notes display in the history table and on RMP cards in the UI

## 1.6.0

### Minor Changes

- b362109: Add OAuth support for Vercel preview branch deployments

  Preview branches can now authenticate users via Google OAuth by routing through production:

  1. Preview initiates OAuth, encoding its origin URL in the OAuth state parameter
  2. Google redirects to production's callback (the only authorized redirect URI)
  3. Production creates a signed auth token (HMAC-SHA256, 60-second expiry) containing user info
  4. Production redirects to preview's `/api/auth/token` endpoint with the token
  5. Preview verifies the token and creates a local session in its Neon branch database

  Security features:

  - Token signed with SESSION_SECRET using HMAC-SHA256
  - 60-second token expiry prevents replay attacks
  - Timing-safe signature comparison prevents timing attacks
  - Redirect URL validation only allows localhost, production URL, and project-specific Vercel preview URLs

## 1.5.2

### Patch Changes

- 462f471: Refactor timer UI to compact inline design. Timer controls (start/pause/stop) now appear as small icon buttons in the log entry form header instead of a large separate card, reducing visual clutter while maintaining all functionality.

## 1.5.1

### Patch Changes

- 18d67ea: Fix timer buttons overflowing on mobile devices by adding responsive styling with flexible widths and mobile-specific media queries

## 1.5.0

### Minor Changes

- a8b52b4: Add start/pause/stop timer feature for tracking training hours. The timer includes:
  - Real-time display with HH:MM:SS format
  - Start, pause, and stop controls
  - localStorage persistence across page reloads
  - Auto-population of form fields when timer is stopped
  - Status indicators showing timer state and start time

## 1.4.0

### Minor Changes

- 6c5f4b3: Add changelog viewer to application

  - Add `/api/changelog` route to display formatted changelog
  - Add changelog icon (📋) next to version number in header
  - Convert CHANGELOG.md markdown to HTML for display
  - Style changelog page with consistent app design

### Patch Changes

- de23b32: Security hardening and OWASP Top 10 improvements

  - Add security headers (X-Frame-Options, CSP, X-Content-Type-Options, Referrer-Policy)
  - Fix session fixation vulnerability by regenerating session after OAuth login
  - Sanitize error messages in production to prevent information leakage
  - Add security logging for authentication events
  - Remove X-Powered-By header
  - Add trust proxy configuration for Vercel deployment

## 1.3.1

### Patch Changes

- 074585e: Initial CHANGELOG release

## 1.3.0

### Minor Changes

- c8f4a03: Performance optimizations and UI improvements

  - Add database indexes for faster queries (userId, status, filedDate, etc.)
  - Optimize database queries with parallel execution and aggregation
  - Add response compression middleware
  - Redesign UI with modern styling and three-bell icon
  - Add profile dropdown with user info and logout
  - Add comprehensive RMP summary dashboard
  - Fix timezone issues with date handling
  - Add version display in UI
  - Fix authentication session handling
  - Improve edit entry highlighting in history table
  - Remove HTML minification (compression handles size reduction more efficiently)

### Patch Changes

- c8f4a03: Fix cache-control headers to prevent caching on authentication routes

  - Add cache-control headers in vercel.json for /api and /api/auth/\* routes
  - Set no-cache headers programmatically in authentication and logout routes
  - Prevent caching issues that could expose authenticated content to unauthenticated users

- c8f4a03: Security improvements and vulnerability fixes

  - Add authentication middleware to protect all POST routes
  - Add authorization checks to RMP endpoints to prevent unauthorized access
  - Escape user data in HTML to prevent XSS attacks (displayName, email, photo URLs)
  - Add comprehensive input validation for dates, times, UUIDs, and numbers
  - Implement CSRF protection with token validation on all forms
  - Add error handling with try-catch blocks to all routes
  - Validate query parameters to prevent injection attacks
