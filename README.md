# Three Bells

A modern web application for tracking and managing Navy Reserve RMP (Reserve Manpower Program) training hours.

## Overview

Three Bells helps Navy Reserve personnel track training hours, bundle them into RMPs, and monitor payment status. The application provides an intuitive interface for logging training sessions, viewing unbundled balances, and managing submitted RMPs.

## Features

- **Training Hour Logging**: Record training sessions with start/end times and automatic hour calculation
- **RMP Bundling**: Automatically bundle 3-hour blocks into submittable RMPs
- **Status Tracking**: Monitor RMP status (Submitted, Paid, Denied)
- **Dashboard Analytics**: View summary statistics including:
  - Available unbundled hours
  - Ready-to-file RMPs
  - Pending RMPs (last 30 days)
  - Total paid RMPs
- **History Management**: Entries grouped by month, edited inline right in the list
- **No page reloads**: Every action updates only what changed and keeps your scroll position, with undo for deletes and payment changes
- **Mobile first, dark mode**: Designed for the installed PWA on a phone, with a bottom-sheet entry form and a floating add button
- **Google OAuth Authentication**: Secure login with Google accounts
- **Changelog Viewer**: Track application updates and improvements

## Tech Stack

- **Backend**: Node.js with Express 5, server-rendered HTML
- **Frontend**: [htmx](https://htmx.org) (vendored in `public/vendor/`) for partial updates, plain CSS and JS, no build step
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Passport.js with Google OAuth 2.0
- **Session Management**: Express Session with Prisma session store
- **Deployment**: Vercel (serverless)
- **Security**: OWASP Top 10 hardening, CSRF protection, XSS prevention

## Prerequisites

- Node.js 18+ (see `.node-version`)
- PostgreSQL database
- Google OAuth credentials
- npm 10.9.4+

## Installation

1. Clone the repository:

```bash
git clone https://github.com/alexjbuck/three-bells.git
cd three-bells
```

2. Install dependencies:

```bash
npm install
```

3. Set up your environment variables (see Configuration below)

4. Run database migrations:

```bash
npx prisma migrate deploy
npx prisma generate
```

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/threebells"

# Session
SESSION_SECRET="your-secure-random-secret-here"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Environment
NODE_ENV="development"

# Vercel (production only)
VERCEL_PROJECT_PRODUCTION_URL="your-app.vercel.app"
```

### Getting Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - Development: `http://localhost:3000/api/auth/callback`
   - Production: `https://your-app.vercel.app/api/auth/callback`

## Development

### Running Locally

```bash
vercel dev
```

The application will be available at `http://localhost:3000`

> **Note:** You'll need the [Vercel CLI](https://vercel.com/docs/cli) installed (`npm i -g vercel`) and to be logged in (`vercel login`).

### Code Quality

```bash
# Run linting and formatting checks
npm run checks

# Auto-fix issues
npm run fix

# Lint only
npm run lint

# Format only
npm run format
```

### Database Management

```bash
# Generate Prisma client
npx prisma generate

# Create a migration
npx prisma migrate dev --name your_migration_name

# View database in Prisma Studio
npx prisma studio
```

## Deployment

Vercel's Git integration deploys the app: every pull request gets a preview, and every
push to `main` deploys production. There is no deploy step in GitHub Actions.

- **Migrations:** production builds run `prisma migrate deploy` before going live
  (`scripts/vercel-build.js`, set as `buildCommand` in `vercel.json`). If migrations fail,
  the build fails and the previous deployment keeps serving. Preview databases (Neon
  branches) are migrated by the PR Checks workflow.
- **Versioning:** when changesets land on `main`, the Release workflow opens or updates a
  "Version Packages" pull request. Merge it to bump the version and update `CHANGELOG.md`.
- **Environment:** set `DATABASE_URL`, `SESSION_SECRET` and the Google OAuth variables in
  the Vercel dashboard. `DATABASE_URL` must be available at build time for production.

The `vercel.json` configuration handles routing, caching headers and the build command.

## Security Features

- **Authentication**: Google OAuth 2.0 with secure session management
- **Session Security**: HTTPOnly cookies, secure flag in production, CSRF protection
- **Headers**: X-Frame-Options, CSP, X-Content-Type-Options, Referrer-Policy
- **Input Validation**: Comprehensive validation on all user inputs
- **XSS Prevention**: HTML escaping on all user-generated content
- **Session Fixation Prevention**: Session regeneration after login
- **Error Handling**: Sanitized error messages in production
- **Audit Logging**: Security event logging for authentication

## Project Structure

```
api/index.js        Express app setup (Vercel serverless entry point)
routes/auth.js      Google OAuth + preview-deployment token hand-off
routes/app.js       Dashboard page and all actions (htmx fragments or redirects)
lib/                Data access (rmp.js), time handling (time.js), validation, security
views/              HTML render functions; each dashboard region renders on its own
public/             app.css, app.js, service worker, PWA assets, vendored htmx
test/               Unit tests (node:test)
```

### How updates work

Actions are regular HTML forms and buttons enhanced with htmx. For an htmx request the
server responds with only the regions that changed (summary, RMPs, history) as
[out-of-band swaps](https://htmx.org/attributes/hx-swap-oob/) plus a toast, so nothing
reloads. Without JavaScript the same endpoints redirect back to the dashboard.

### Times

Log times are wall-clock times (what the user typed) stored as UTC and always parsed and
formatted in UTC, so results never depend on the server's timezone. The browser supplies
anything that needs the user's local time, like today's date and the timer.

## Database Schema

- **Rmp**: Stores submitted RMP records with status tracking
- **Log**: Individual training hour entries
- **Session**: Secure session storage

See `prisma/schema.prisma` for full schema details.

## Scripts

- `npm run changeset` - Create a new changeset for version management
- `npm run checks` - Run all quality checks (lint + format check + tests)
- `npm test` - Run unit tests (`node --test`)
- `npm run fix` - Auto-fix linting and formatting issues
- `npm run format` - Format code with oxfmt
- `npm run format:check` - Check code formatting
- `npm run lint` - Lint code with oxlint
- `npm run lint:fix` - Auto-fix linting issues
- `npm run release` - Publish a new version
- `npm run version` - Update version based on changesets

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run quality checks (`npm run checks`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Version Management

This project uses [Changesets](https://github.com/changesets/changesets) for version management:

1. Make your changes
2. Run `npm run changeset` to document your changes
3. Commit the changeset file along with your changes
4. On merge to main, versions are automatically bumped

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Alex Buck ([@alexjbuck](https://github.com/alexjbuck))

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes.

## Support

For issues, questions, or contributions, please open an issue on GitHub.
