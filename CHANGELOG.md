# three-bells

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
