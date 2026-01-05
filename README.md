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
- **History Management**: View and edit all training log entries
- **Google OAuth Authentication**: Secure login with Google accounts
- **Changelog Viewer**: Track application updates and improvements

## Tech Stack

- **Backend**: Node.js with Express 5
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
npm start
```

The application will be available at `http://localhost:3000`

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

This application is configured for deployment on Vercel:

1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

The `vercel.json` configuration handles routing and caching headers.

## Security Features

- **Authentication**: Google OAuth 2.0 with secure session management
- **Session Security**: HTTPOnly cookies, secure flag in production, CSRF protection
- **Headers**: X-Frame-Options, CSP, X-Content-Type-Options, Referrer-Policy
- **Input Validation**: Comprehensive validation on all user inputs
- **XSS Prevention**: HTML escaping on all user-generated content
- **Session Fixation Prevention**: Session regeneration after login
- **Error Handling**: Sanitized error messages in production
- **Audit Logging**: Security event logging for authentication

## Database Schema

- **Rmp**: Stores submitted RMP records with status tracking
- **Log**: Individual training hour entries
- **Session**: Secure session storage

See `prisma/schema.prisma` for full schema details.

## Scripts

- `npm run changeset` - Create a new changeset for version management
- `npm run checks` - Run all quality checks (lint + format check)
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
