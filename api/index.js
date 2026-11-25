// Express app entry point (deployed as a Vercel serverless function).
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { PrismaSessionStore } = require("@quixo3/prisma-session-store");
const compression = require("compression");
const prisma = require("../lib/db");
const { isProd } = require("../lib/security");
const { PUBLIC_DIR } = require("../lib/assets");

const app = express();

// Trust proxy - required for Vercel to detect HTTPS and set secure cookies
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Static files (PWA assets, CSS, JS). Versioned URLs (?v=hash) are safe to cache long.
app.use(
  express.static(PUBLIC_DIR, {
    maxAge: "1d",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("service-worker.js")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else if (res.req?.query?.v) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }),
);

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com;",
  );
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(compression());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      // sameSite "none" (which requires secure) is needed for OAuth callbacks in production.
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      httpOnly: true,
    },
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new PrismaSessionStore(prisma, {
      checkPeriod: 2 * 60 * 1000,
      dbRecordIdIsSessionId: true,
    }),
  }),
);

app.use(passport.initialize());
app.use(passport.session());

const baseUrl = isProd
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${baseUrl}/api/auth/callback`,
    },
    (token, tokenSecret, profile, done) => done(null, profile),
  ),
);
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.use(require("../routes/auth"));
app.use(require("../routes/app"));

module.exports = app;
