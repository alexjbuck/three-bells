const express = require("express");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { PrismaSessionStore } = require("@quixo3/prisma-session-store");
const compression = require("compression");
const crypto = require("node:crypto");
const rateLimit = require("express-rate-limit");

const prisma = new PrismaClient();
const app = express();

// Trust proxy - required for Vercel to detect HTTPS and set secure cookies
app.set("trust proxy", 1);

// Serve static files from public directory (for PWA assets)
app.use(
  express.static(path.join(__dirname, "..", "public"), {
    maxAge: "1d",
    setHeaders: (res, filePath) => {
      // Service worker should not be cached aggressively
      if (filePath.endsWith("service-worker.js")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  }),
);

// Security headers middleware
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Basic CSP - allow same-origin and Google OAuth
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://accounts.google.com; frame-ancestors 'none';",
  );
  // Control referrer information
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Remove X-Powered-By header
  res.removeHeader("X-Powered-By");
  next();
});

// Middleware
app.use(compression()); // Compress responses
app.use(express.urlencoded({ extended: true }));
const isProd = process.env.NODE_ENV === "production";

app.use(
  session({
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      // secure: true is required when sameSite: "none" - but only in production (HTTPS)
      // In local dev, secure: false allows cookies over HTTP
      secure: isProd,
      // sameSite: "none" is required for OAuth callbacks (cross-site redirects)
      // In local dev, we can use "lax" since we're not doing cross-site
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

// Validate redirect URLs to prevent open redirect attacks
// Allows: localhost (dev), production URL, and Vercel preview deployments
function isValidRedirectUrl(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    // Allow localhost for development
    if (hostname === "localhost") {
      return true;
    }

    // Allow production URL
    const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (prodUrl && hostname === prodUrl) {
      return true;
    }

    // Allow Vercel preview deployments for this project only
    // Patterns:
    //   three-bells-git-{branch}-alexjbucks-projects.vercel.app (branch deploys)
    //   three-bells-{hash}-alexjbucks-projects.vercel.app (PR/commit deploys)
    if (hostname.endsWith(".vercel.app")) {
      if (
        hostname === "three-bells.vercel.app" ||
        (hostname.startsWith("three-bells-") && hostname.includes("-alexjbucks-projects"))
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

// Create a signed token for cross-origin auth (preview branch redirects)
// Token format: base64url(payload).base64url(signature)
// Expires after 60 seconds to prevent replay attacks
function createAuthToken(user) {
  const payload = {
    id: user.id,
    displayName: user.displayName,
    emails: user.emails,
    exp: Date.now() + 60 * 1000, // 60 second expiry
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(payloadStr)
    .digest("base64url");
  return `${payloadStr}.${signature}`;
}

// Verify and decode an auth token
// Returns user object if valid, null if invalid/expired
function verifyAuthToken(token) {
  try {
    const [payloadStr, signature] = token.split(".");
    if (!payloadStr || !signature) return null;

    const expectedSig = crypto
      .createHmac("sha256", process.env.SESSION_SECRET)
      .update(payloadStr)
      .digest("base64url");

    // Timing-safe comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString());

    // Check expiry
    if (payload.exp < Date.now()) {
      console.warn("[SECURITY] Auth token expired");
      return null;
    }

    return {
      id: payload.id,
      displayName: payload.displayName,
      emails: payload.emails,
    };
  } catch (e) {
    console.warn("[SECURITY] Auth token verification failed:", e.message);
    return null;
  }
}

// Rate limiter for auth endpoints to prevent brute-force attempts
const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 10, // max 10 requests per minute per IP
  message: "Too many requests",
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(
      `[SECURITY] Rate limit exceeded for IP: ${req.ip || req.connection.remoteAddress}`,
    );
    res.status(429).send("Too many requests");
  },
});

const cleanNum = (n) => Math.round(n * 100) / 100;

// SECURITY HELPERS
// Sanitize error messages in production to prevent information leakage
const sanitizeError = (error, isProd) => {
  if (!isProd) {
    return error?.message || "Bad Request";
  }
  // In production, don't expose error details
  if (error?.message?.includes("Invalid") || error?.message?.includes("required")) {
    return "Invalid request";
  }
  return "An error occurred";
};
// HTML escaping to prevent XSS
const escapeHtml = (str) => {
  if (!str) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

// URL validation for image src attributes - validate HTTP/HTTPS only
const escapeUrl = (str) => {
  if (!str) return null;
  const url = String(str).trim();
  // Only allow http:// or https:// URLs for security (prevents javascript: and data: XSS)
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return null; // Invalid protocol, reject
  }
  // Return URL as-is - template literal with double quotes will handle it correctly
  // Only escape double quotes that could break out of the HTML attribute
  return url.replaceAll('"', "&quot;");
};

// UUID validation
const isValidUUID = (str) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

// Date validation (YYYY-MM-DD)
const isValidDate = (str) => {
  if (!str || typeof str !== "string") return false;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(str)) return false;
  const date = new Date(str + "T00:00:00");
  return date instanceof Date && !Number.isNaN(date) && str === date.toISOString().split("T")[0];
};

// Time validation (HH:MM)
const isValidTime = (str) => {
  if (!str || typeof str !== "string") return false;
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return timeRegex.test(str);
};

// Number validation
const isValidNumber = (val, min = -Infinity, max = Infinity) => {
  const num = Number.parseFloat(val);
  return !Number.isNaN(num) && Number.isFinite(num) && num >= min && num <= max;
};

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.isAuthenticated?.()) {
    return res.redirect("/api");
  }
  if (!req.user?.id) {
    return res.status(401).send("Unauthorized");
  }
  next();
};

// CSRF token generation and validation
const generateCSRFToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const getCSRFToken = (req) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCSRFToken();
  }
  return req.session.csrfToken;
};

const validateCSRFToken = (req) => {
  const token = req.body._csrf || req.body.csrfToken;
  const sessionToken = req.session.csrfToken;
  return token && sessionToken && token === sessionToken;
};

// MAIN ROUTE
app.get("/", async (req, res) => {
  // Prevent caching - redirects should not be cached
  // Vercel-CDN-Cache-Control prevents Vercel's edge cache from caching this response
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Vercel-CDN-Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  // redirect to /api
  res.redirect("/api");
});
const packageJson = require("../package.json");
const fs = require("node:fs");

app.get("/api", async (req, res) => {
  try {
    // Prevent caching - this endpoint serves different content based on auth state
    // Vercel-CDN-Cache-Control prevents Vercel's edge cache from caching this response
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Vercel-CDN-Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });

    // Check authentication
    if (!req.isAuthenticated?.()) {
      // Landing page - no JavaScript, pure HTML/CSS
      // Don't cache - this is the same route as authenticated page
      const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta name="description" content="Track and manage your Navy Reserve RMP (Reserve Manpower Program) training hours. Log hours, bundle into RMPs, and track payment status.">
                <meta name="theme-color" content="#002447">
                <meta name="apple-mobile-web-app-capable" content="yes">
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
                <meta name="apple-mobile-web-app-title" content="Three Bells">
                <link rel="manifest" href="/manifest.json">
                <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
                <link rel="apple-touch-icon" href="/icons/icon-192.png">
                <title>Three Bells - Navy Reserve RMP Tracker</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        background: linear-gradient(135deg, #002447 0%, #003d6b 50%, #002447 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }
                    .container {
                        background: white;
                        border-radius: 20px;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                        padding: 60px 40px;
                        max-width: 500px;
                        width: 100%;
                        text-align: center;
                        animation: fadeIn 0.6s ease-out;
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .icon {
                        width: 90px;
                        height: 90px;
                        background: linear-gradient(135deg, #002447 0%, #003d6b 100%);
                        border-radius: 20px;
                        margin: 0 auto 30px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 10px 30px rgba(0, 36, 71, 0.3);
                        position: relative;
                        padding: 12px;
                    }
                    .bells {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        grid-template-rows: 1fr 1fr;
                        gap: 4px;
                        align-items: center;
                        justify-content: center;
                        width: 100%;
                        height: 100%;
                        position: relative;
                    }
                    .bell {
                        font-size: 20px;
                        line-height: 1;
                        filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .bell:nth-child(1) {
                        grid-column: 1 / -1;
                        grid-row: 1;
                        justify-self: center;
                        align-self: end;
                    }
                    .bell:nth-child(2) {
                        grid-column: 1;
                        grid-row: 2;
                        justify-self: center;
                        align-self: start;
                    }
                    .bell:nth-child(3) {
                        grid-column: 2;
                        grid-row: 2;
                        justify-self: center;
                        align-self: start;
                    }
                    h1 {
                        font-size: 2.5em;
                        color: #002447;
                        margin-bottom: 10px;
                        font-weight: 700;
                        letter-spacing: -0.5px;
                    }
                    .subtitle {
                        color: #666;
                        font-size: 1.1em;
                        margin-bottom: 40px;
                        line-height: 1.6;
                    }
                    .login-button {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        gap: 12px;
                        background: #4285F4;
                        color: white;
                        padding: 14px 28px;
                        text-decoration: none;
                        border-radius: 10px;
                        font-size: 1em;
                        font-weight: 600;
                        transition: all 0.3s ease;
                        box-shadow: 0 4px 15px rgba(66, 133, 244, 0.4);
                        border: none;
                        cursor: pointer;
                    }
                    .login-button:hover {
                        background: #357ae8;
                        transform: translateY(-2px);
                        box-shadow: 0 6px 20px rgba(66, 133, 244, 0.5);
                    }
                    .login-button:active {
                        transform: translateY(0);
                    }
                    .google-icon {
                        width: 20px;
                        height: 20px;
                        background: white;
                        border-radius: 4px;
                        display: inline-block;
                    }
                    .features {
                        margin-top: 40px;
                        padding-top: 40px;
                        border-top: 1px solid #eee;
                        text-align: left;
                    }
                    .features h3 {
                        color: #002447;
                        font-size: 1.1em;
                        margin-bottom: 20px;
                        text-align: center;
                    }
                    .feature {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        margin-bottom: 15px;
                        color: #555;
                        font-size: 0.95em;
                    }
                    .feature-icon {
                        width: 24px;
                        height: 24px;
                        background: #f0f7ff;
                        border-radius: 6px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #002447;
                        font-weight: bold;
                        flex-shrink: 0;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">
                        <div class="bells">
                            <span class="bell">🔔</span>
                            <span class="bell">🔔</span>
                            <span class="bell">🔔</span>
                        </div>
                    </div>
                    <h1>Three Bells</h1>
                    <p class="subtitle">Navy Reserve RMP Tracker</p>
                    <a href="/api/auth/google" class="login-button">
                        <svg class="google-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Sign in with Google
                    </a>
                    <div class="features">
                        <h3>Track & Manage</h3>
                        <div class="feature">
                            <div class="feature-icon">⏱</div>
                            <span>Log your training hours</span>
                        </div>
                        <div class="feature">
                            <div class="feature-icon">📋</div>
                            <span>Bundle hours into RMPs</span>
                        </div>
                        <div class="feature">
                            <div class="feature-icon">💰</div>
                            <span>Track payment status</span>
                        </div>
                    </div>
                </div>
                <script>
                    if ('serviceWorker' in navigator) {
                        navigator.serviceWorker.register('/service-worker.js')
                            .catch(err => console.error('SW registration failed:', err));
                    }
                </script>
            </body>
            </html>
        `;
      return res.send(html);
    }

    const userId = req.user.id;
    const todayStr = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

    // Optimize: Fetch data in parallel and calculate metrics in database
    const [logs, rmps, unbundledHours, rmpCounts] = await Promise.all([
      prisma.log.findMany({ where: { userId }, orderBy: { start: "desc" } }),
      prisma.rmp.findMany({ where: { userId }, orderBy: { filedDate: "desc" } }),
      // Calculate unbundled hours in database
      prisma.log.aggregate({
        where: { userId, rmpId: null },
        _sum: { hours: true },
      }),
      // Count RMPs by status in database
      prisma.rmp.groupBy({
        by: ["status"],
        where: { userId },
        _count: true,
      }),
    ]);

    const earnedHours = cleanNum(unbundledHours._sum.hours || 0);
    const availableRMPs = Math.floor(earnedHours / 3);

    // Calculate RMP summary metrics from database results
    const pendingRmps = rmpCounts.find((r) => r.status === "submitted")?._count || 0;
    const paidRmps = rmpCounts.find((r) => r.status === "paid")?._count || 0;

    // Count pending RMPs in last 30 days
    const pendingRmpsLast30Days = rmps.filter((r) => {
      if (r.status !== "submitted") return false;
      const filedDate = new Date(r.filedDate);
      filedDate.setUTCHours(0, 0, 0, 0);
      return filedDate >= thirtyDaysAgo;
    }).length;

    // Validate edit query parameter if present
    let editLog = null;
    if (req.query.edit) {
      if (isValidUUID(req.query.edit)) {
        editLog = await prisma.log.findFirst({
          where: { id: req.query.edit, userId, rmpId: null },
        });
      } else {
        // Invalid UUID in query - ignore it
        console.warn("Invalid UUID in edit query parameter:", req.query.edit);
      }
    }

    // Get CSRF token for forms
    const csrfToken = getCSRFToken(req);

    // Escape user data to prevent XSS
    const userDisplayName = escapeHtml(req.user.displayName || "User");
    const userEmail = escapeHtml(req.user.emails?.[0]?.value || "");
    const userPhotoUrl = req.user.photos?.[0]?.value ? escapeUrl(req.user.photos[0].value) : null;
    const userInitial = (req.user.displayName ||
      req.user.emails?.[0]?.value ||
      "U")[0].toUpperCase();

    const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="description" content="Three Bells Dashboard - Manage your Navy Reserve RMP training hours, view unbundled balance, track submitted RMPs, and log new training entries.">
            <meta name="theme-color" content="#002447">
            <meta name="apple-mobile-web-app-capable" content="yes">
            <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
            <meta name="apple-mobile-web-app-title" content="Three Bells">
            <link rel="manifest" href="/manifest.json">
            <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
            <link rel="apple-touch-icon" href="/icons/icon-192.png">
            <title>Three Bells - Dashboard</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    background: linear-gradient(135deg, #002447 0%, #003d6b 50%, #002447 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                .container {
                    background: white;
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    max-width: 700px;
                    margin: 0 auto;
                    padding: 30px;
                    animation: fadeIn 0.6s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid #f0f0f0;
                }
                .header h1 {
                    font-size: 2em;
                    color: #002447;
                    margin: 0;
                    font-weight: 700;
                    letter-spacing: -0.5px;
                }
                .version {
                    color: #999;
                    font-size: 0.75em;
                    margin-top: 4px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .changelog-link {
                    color: #999;
                    text-decoration: none;
                    font-size: 0.9em;
                    transition: color 0.2s;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }
                .changelog-link:hover {
                    color: #002447;
                }
                .profile-container {
                    position: relative;
                }
                .profile-btn {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 5px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    transition: transform 0.2s;
                }
                .profile-btn:hover {
                    transform: scale(1.05);
                }
                .profile-img {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    border: 2px solid #ddd;
                }
                .profile-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    border: 2px solid #ddd;
                    background: #666;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    font-size: 16px;
                }
                .profile-dropdown {
                    display: none;
                    position: absolute;
                    right: 0;
                    top: 50px;
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 12px;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
                    min-width: 220px;
                    z-index: 1000;
                    overflow: hidden;
                }
                .profile-dropdown.show {
                    display: block;
                }
                .profile-info {
                    padding: 16px;
                    border-bottom: 1px solid #eee;
                }
                .profile-name {
                    font-weight: 600;
                    font-size: 0.95em;
                    color: #002447;
                }
                .profile-email {
                    color: #666;
                    font-size: 0.85em;
                    margin-top: 4px;
                }
                .profile-logout {
                    display: block;
                    padding: 12px 16px;
                    color: #666;
                    text-decoration: none;
                    font-size: 0.9em;
                    transition: background 0.2s;
                }
                .profile-logout:hover {
                    background: #f5f5f5;
                }
                .summary-card {
                    background: linear-gradient(135deg, #002447 0%, #003d6b 100%);
                    color: white;
                    padding: 30px;
                    border-radius: 16px;
                    margin-bottom: 30px;
                    box-shadow: 0 10px 30px rgba(0, 36, 71, 0.3);
                }
                .summary-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                    gap: 24px;
                }
                .summary-item {
                    text-align: center;
                }
                .summary-label {
                    opacity: 0.9;
                    font-size: 0.85em;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 8px;
                }
                .summary-value {
                    font-size: 2.2em;
                    font-weight: 700;
                    margin: 8px 0;
                }
                .summary-sub {
                    color: #ffc107;
                    font-weight: 600;
                    font-size: 0.9em;
                }
                .card {
                    background: white;
                    padding: 24px;
                    border-radius: 16px;
                    margin-bottom: 24px;
                    border: 1px solid #eee;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                    transition: box-shadow 0.2s;
                }
                .card:hover {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .card.highlight {
                    border: 2px solid #ffc107;
                    background: #fffef5;
                }
                .card.edit-mode {
                    background: #fff3cd;
                    border-color: #ffc107;
                }
                .card h3 {
                    margin: 0 0 20px 0;
                    color: #002447;
                    font-size: 1.3em;
                    font-weight: 600;
                }
                .form-group {
                    margin-bottom: 16px;
                }
                .form-label {
                    display: block;
                    font-size: 0.85em;
                    font-weight: 600;
                    color: #555;
                    margin-bottom: 8px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                input[type="date"],
                input[type="time"],
                input[type="number"],
                input[type="text"].note-input {
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #e0e0e0;
                    border-radius: 8px;
                    font-size: 1em;
                    transition: border-color 0.2s;
                    font-family: inherit;
                    box-sizing: border-box;
                }
                input:focus {
                    outline: none;
                    border-color: #002447;
                }
                .time-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                }
                @media (max-width: 440px) {
                    .time-grid {
                        grid-template-columns: 1fr;
                    }
                }
                .divider {
                    text-align: center;
                    margin: 16px 0;
                    font-size: 0.8em;
                    color: #999;
                    position: relative;
                }
                .divider::before,
                .divider::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    width: 40%;
                    height: 1px;
                    background: #eee;
                }
                .divider::before {
                    left: 0;
                }
                .divider::after {
                    right: 0;
                }
                .manual-input {
                    display: flex;
                    gap: 12px;
                }
                .btn {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: 1em;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-family: inherit;
                }
                .btn-primary {
                    background: #002447;
                    color: white;
                }
                .btn-primary:hover {
                    background: #003d6b;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0, 36, 71, 0.3);
                }
                .btn-warning {
                    background: #ffc107;
                    color: #002447;
                }
                .btn-warning:hover {
                    background: #ffb300;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(255, 193, 7, 0.3);
                }
                .btn-small {
                    padding: 6px 12px;
                    font-size: 0.85em;
                }
                .btn-danger {
                    background: #dc3545;
                    color: white;
                }
                .btn-danger:hover {
                    background: #c82333;
                }
                .btn-link {
                    background: none;
                    color: #002447;
                    text-decoration: underline;
                    padding: 0;
                    font-size: 0.9em;
                }
                .section-title {
                    font-size: 1.4em;
                    font-weight: 600;
                    color: #002447;
                    margin: 40px 0 20px 0;
                }
                .rmp-card {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px;
                    border-left: 5px solid;
                    border-radius: 12px;
                    margin-bottom: 16px;
                    background: #f8f9fa;
                }
                .rmp-card.paid {
                    border-left-color: #28a745;
                }
                .rmp-card.pending {
                    border-left-color: #ffc107;
                }
                .rmp-info strong {
                    display: block;
                    color: #002447;
                    margin-bottom: 8px;
                }
                .rmp-notes {
                    font-size: 0.85em;
                    color: #555;
                    font-style: italic;
                    margin: 8px 0;
                    padding: 6px 10px;
                    background: #f8f9fa;
                    border-radius: 6px;
                    max-height: 80px;
                    overflow-y: auto;
                    word-break: break-word;
                    white-space: pre-line;
                }
                .rmp-badge {
                    display: inline-block;
                    font-size: 0.75em;
                    padding: 4px 10px;
                    border-radius: 12px;
                    color: white;
                    text-transform: uppercase;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                }
                .rmp-badge.paid {
                    background: #28a745;
                }
                .rmp-badge.pending {
                    background: #ffc107;
                }
                .rmp-actions {
                    display: flex;
                    gap: 8px;
                }
                .history-table {
                    width: 100%;
                    border-collapse: collapse;
                    background: white;
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }
                .history-table tr {
                    border-bottom: 1px solid #f0f0f0;
                    transition: background 0.2s;
                }
                .history-table tr:hover {
                    background: #f8f9fa;
                }
                .history-table tr.locked {
                    opacity: 0.5;
                }
                .history-table tr.editing {
                    background: #fff3cd !important;
                    border-left: 4px solid #ffc107;
                }
                .history-table tr.editing:hover {
                    background: #fff3cd !important;
                }
                .history-table td {
                    padding: 16px;
                    vertical-align: middle;
                }
                .history-date {
                    font-weight: 500;
                    color: #002447;
                }
                .history-time {
                    color: #666;
                    font-size: 0.85em;
                    margin-top: 4px;
                }
                .history-note {
                    color: #555;
                    font-size: 0.85em;
                    margin-top: 4px;
                    font-style: italic;
                    max-width: 200px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .history-hours {
                    font-weight: 600;
                    font-size: 1.1em;
                    color: #002447;
                }
                .history-actions {
                    text-align: right;
                }
                .history-actions a {
                    text-decoration: none;
                    margin-right: 8px;
                    font-size: 1.2em;
                }
                .history-actions button {
                    background: none;
                    border: none;
                    color: #dc3545;
                    cursor: pointer;
                    font-size: 1.2em;
                    padding: 0;
                    margin-left: 8px;
                }
                .loading-overlay {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(255,255,255,0.9);
                    z-index: 9999;
                    justify-content: center;
                    align-items: center;
                    flex-direction: column;
                }
                .spinner {
                    width: 50px;
                    height: 50px;
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #002447;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .timer-inline {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-left: auto;
                }
                .timer-display-inline {
                    font-size: 0.9em;
                    font-weight: 600;
                    color: #002447;
                    font-variant-numeric: tabular-nums;
                    min-width: 65px;
                }
                .timer-btn-icon {
                    background: none;
                    border: 2px solid #ddd;
                    border-radius: 50%;
                    width: 32px;
                    height: 32px;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-family: inherit;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1em;
                    padding: 0;
                }
                .timer-btn-icon:hover:not(:disabled) {
                    transform: scale(1.1);
                }
                .timer-btn-icon-start {
                    border-color: #28a745;
                    color: #28a745;
                }
                .timer-btn-icon-start:hover:not(:disabled) {
                    background: #28a745;
                    color: white;
                }
                .timer-btn-icon-pause {
                    border-color: #ffc107;
                    color: #ffc107;
                }
                .timer-btn-icon-pause:hover:not(:disabled) {
                    background: #ffc107;
                    color: #002447;
                }
                .timer-btn-icon-stop {
                    border-color: #dc3545;
                    color: #dc3545;
                }
                .timer-btn-icon-stop:hover:not(:disabled) {
                    background: #dc3545;
                    color: white;
                }
                .timer-btn-icon:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                    transform: none !important;
                }
                .card-header-with-timer {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 20px;
                }
                .card-header-with-timer h3 {
                    margin: 0;
                }
            </style>
        </head>
        <body>
            <div id="loader" class="loading-overlay">
                <div class="spinner"></div>
            </div>

            <div class="container">
                <div class="header">
                    <div>
                        <h1>Three Bells</h1>
                        <div class="version">
                            v${packageJson.version}
                            <a href="/api/changelog" class="changelog-link" title="View changelog">
                                📋
                            </a>
                        </div>
                    </div>
                    <div class="profile-container">
                        <button id="profileBtn" class="profile-btn">
                            ${
                              userPhotoUrl
                                ? `<img src="${userPhotoUrl}" alt="Profile" class="profile-img">`
                                : `<div class="profile-avatar">${userInitial}</div>`
                            }
                        </button>
                        <div id="profileDropdown" class="profile-dropdown">
                            <div class="profile-info">
                                <div class="profile-name">${userDisplayName}</div>
                                <div class="profile-email">${userEmail}</div>
                            </div>
                            <a href="/api/logout" class="profile-logout">Logout</a>
                        </div>
                    </div>
                </div>

                <div class="summary-card">
                    <div class="summary-grid">
                        <div class="summary-item">
                            <div class="summary-label">Unbundled Balance</div>
                            <div class="summary-value">${earnedHours} hrs</div>
                            <div class="summary-sub">${availableRMPs} RMPs Ready</div>
                        </div>
                        <div class="summary-item">
                            <div class="summary-label">Pending RMPs</div>
                            <div class="summary-value">${pendingRmps}</div>
                            <div class="summary-sub">${pendingRmpsLast30Days} in last 30 days</div>
                        </div>
                        <div class="summary-item">
                            <div class="summary-label">Paid RMPs</div>
                            <div class="summary-value">${paidRmps}</div>
                        </div>
                    </div>
                </div>

                ${
                  availableRMPs > 0 && !editLog
                    ? `
                    <div class="card highlight">
                        <h3>Ready to File RMP</h3>
                        <form action="/api/submit-unit" method="POST">
                            <input type="hidden" name="_csrf" value="${csrfToken}">
                            <div class="form-group">
                                <label class="form-label">EDM Filing Date</label>
                                <input type="date" name="filedDate" value="${todayStr}" required>
                            </div>
                            <button type="submit" class="btn btn-warning" style="width:100%;">Bundle 3.0 hrs</button>
                        </form>
                    </div>
                `
                    : ""
                }

                <div class="card ${editLog ? "edit-mode" : ""}">
                    <div class="card-header-with-timer">
                        <h3>${editLog ? "Edit Entry" : "Log Hours"}</h3>
                        ${
                          !editLog
                            ? `
                        <div class="timer-inline">
                            <div class="timer-display-inline" id="timerDisplay">00:00:00</div>
                            <button id="startBtn" class="timer-btn-icon timer-btn-icon-start" title="Start timer">▶</button>
                            <button id="pauseBtn" class="timer-btn-icon timer-btn-icon-pause" disabled title="Pause timer">⏸</button>
                            <button id="stopBtn" class="timer-btn-icon timer-btn-icon-stop" disabled title="Stop and populate form">⏹</button>
                        </div>
                        `
                            : ""
                        }
                    </div>
                    <form action="${editLog ? `/api/update/${editLog.id}` : "/api/add"}" method="POST">
                        <input type="hidden" name="_csrf" value="${csrfToken}">
                        <div class="form-group">
                            <label class="form-label">Work Date</label>
                            <input type="date" name="workDate" value="${editLog ? editLog.start.toISOString().split("T")[0] : todayStr}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Time Range</label>
                            <div class="time-grid">
                                <input type="time" name="startTime" value="${editLog && editLog.start.getTime() !== editLog.end.getTime() ? editLog.start.toISOString().slice(11, 16) : ""}" placeholder="Start">
                                <input type="time" name="endTime" value="${editLog && editLog.start.getTime() !== editLog.end.getTime() ? editLog.end.toISOString().slice(11, 16) : ""}" placeholder="End">
                            </div>
                        </div>
                        <div class="divider">OR MANUAL</div>
                        <div class="form-group">
                            <div class="manual-input">
                                <input type="number" step="0.1" name="manualHours" value="${editLog && editLog.start.getTime() === editLog.end.getTime() ? editLog.hours : ""}" placeholder="Hours" style="flex:1;">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Note (optional)</label>
                            <input type="text" name="note" value="${editLog?.note ? escapeHtml(editLog.note) : ""}" placeholder="What did you work on?" maxlength="500" class="note-input">
                        </div>
                        <div class="form-group">
                            <button type="submit" class="btn btn-primary" style="width:100%;">${editLog ? "Save" : "Log"}</button>
                        </div>
                        ${editLog ? `<a href="/api" class="btn btn-link" style="display:block; text-align:center; margin-top:12px;">Cancel</a>` : ""}
                    </form>
                </div>

                <h2 class="section-title">Submitted RMPs</h2>
                ${
                  rmps.length > 0
                    ? rmps
                        .map((r) => {
                          const date = new Date(r.filedDate);
                          const month = date.getUTCMonth() + 1;
                          const day = date.getUTCDate();
                          const year = date.getUTCFullYear();
                          const displayDate = `${month}/${day}/${year}`;
                          return `
                    <div class="rmp-card ${r.status === "paid" ? "paid" : "pending"}">
                        <div class="rmp-info">
                            <strong>Filed: ${displayDate}</strong>
                            <span class="rmp-badge ${r.status === "paid" ? "paid" : "pending"}">${r.status}</span>
                        </div>
                        ${r.notes ? `<div class="rmp-notes">${escapeHtml(r.notes)}</div>` : ""}
                        <div class="rmp-actions">
                            <form action="/api/rmp/toggle-paid/${r.id}" method="POST" style="display:inline;">
                                <input type="hidden" name="_csrf" value="${csrfToken}">
                                <button type="submit" class="btn btn-small ${r.status === "paid" ? "btn-primary" : "btn-warning"}">${r.status === "paid" ? "Unpay" : "Mark Paid"}</button>
                            </form>
                            <form action="/api/rmp/delete/${r.id}" method="POST" onsubmit="return confirm('Unsubmit this RMP?')" style="display:inline;">
                                <input type="hidden" name="_csrf" value="${csrfToken}">
                                <button type="submit" class="btn btn-small btn-danger">&times;</button>
                            </form>
                        </div>
                    </div>
                `;
                        })
                        .join("")
                    : '<p style="color:#999; text-align:center; padding:20px;">No submitted RMPs yet</p>'
                }

                <h2 class="section-title">History</h2>
                <table class="history-table">
                    ${
                      logs.length > 0
                        ? logs
                            .map(
                              (l) => `
                        <tr class="${l.rmpId ? "locked" : ""} ${editLog && editLog.id === l.id ? "editing" : ""}">
                            <td>
                                <div class="history-date">${l.start.toLocaleDateString()}</div>
                                <div class="history-time">${l.start.getTime() === l.end.getTime() ? "Manual entry" : l.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " - " + l.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                                ${l.note ? `<div class="history-note">${escapeHtml(l.note)}</div>` : ""}
                            </td>
                            <td class="history-hours">${l.hours}h</td>
                            <td class="history-actions">
                                ${
                                  l.rmpId
                                    ? '<span style="color:#999;">🔒 Bundled</span>'
                                    : `
                                    <a href="/api?edit=${l.id}">✏️</a>
                                    <form action="/api/delete/${l.id}" method="POST" style="display:inline;" onsubmit="return confirm('Delete this entry?')">
                                        <input type="hidden" name="_csrf" value="${csrfToken}">
                                        <button type="submit">&times;</button>
                                    </form>
                                `
                                }
                            </td>
                        </tr>
                    `,
                            )
                            .join("")
                        : '<tr><td colspan="3" style="text-align:center; padding:40px; color:#999;">No entries yet</td></tr>'
                    }
                </table>
            </div>
            <script>
                document.querySelectorAll('form').forEach(f => f.addEventListener('submit', () => {
                    document.getElementById('loader').style.display = 'flex';
                }));

                // Profile dropdown toggle
                const profileBtn = document.getElementById('profileBtn');
                const profileDropdown = document.getElementById('profileDropdown');
                if (profileBtn && profileDropdown) {
                    profileBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        profileDropdown.classList.toggle('show');
                    });
                    document.addEventListener('click', () => {
                        profileDropdown.classList.remove('show');
                    });
                    profileDropdown.addEventListener('click', (e) => e.stopPropagation());
                }

                // Timer functionality
                const timerDisplay = document.getElementById('timerDisplay');
                const startBtn = document.getElementById('startBtn');
                const pauseBtn = document.getElementById('pauseBtn');
                const stopBtn = document.getElementById('stopBtn');

                if (timerDisplay && startBtn && pauseBtn && stopBtn) {
                    let timerInterval = null;
                    let timerState = {
                        status: 'idle', // idle, running, paused
                        startTime: null,
                        elapsedMs: 0,
                        pausedMs: 0
                    };

                    // Load timer state from localStorage
                    function loadTimerState() {
                        const saved = localStorage.getItem('timerState');
                        if (saved) {
                            try {
                                timerState = JSON.parse(saved);
                                if (timerState.status === 'running') {
                                    // Calculate elapsed time since page load
                                    const now = Date.now();
                                    const actualElapsed = now - new Date(timerState.startTime).getTime();
                                    timerState.elapsedMs = actualElapsed;
                                    startInterval();
                                    updateUI();
                                } else if (timerState.status === 'paused') {
                                    updateDisplay();
                                    updateUI();
                                }
                            } catch (e) {
                                console.error('Failed to load timer state:', e);
                                resetTimer();
                            }
                        }
                    }

                    // Save timer state to localStorage
                    function saveTimerState() {
                        localStorage.setItem('timerState', JSON.stringify(timerState));
                    }

                    // Format milliseconds to HH:MM:SS
                    function formatTime(ms) {
                        const totalSeconds = Math.floor(ms / 1000);
                        const hours = Math.floor(totalSeconds / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        const seconds = totalSeconds % 60;
                        return [hours, minutes, seconds]
                            .map(v => v.toString().padStart(2, '0'))
                            .join(':');
                    }

                    // Update timer display
                    function updateDisplay() {
                        timerDisplay.textContent = formatTime(timerState.elapsedMs);
                    }

                    // Update UI based on state
                    function updateUI() {
                        if (timerState.status === 'idle') {
                            startBtn.disabled = false;
                            startBtn.textContent = '▶';
                            startBtn.title = 'Start timer';
                            pauseBtn.disabled = true;
                            stopBtn.disabled = true;
                        } else if (timerState.status === 'running') {
                            startBtn.disabled = true;
                            pauseBtn.disabled = false;
                            stopBtn.disabled = false;
                        } else if (timerState.status === 'paused') {
                            startBtn.disabled = false;
                            startBtn.textContent = '▶';
                            startBtn.title = 'Resume timer';
                            pauseBtn.disabled = true;
                            stopBtn.disabled = false;
                        }
                    }

                    // Start interval for updating display
                    function startInterval() {
                        if (timerInterval) clearInterval(timerInterval);
                        timerInterval = setInterval(() => {
                            const now = Date.now();
                            timerState.elapsedMs = now - new Date(timerState.startTime).getTime();
                            updateDisplay();
                            saveTimerState();
                        }, 100);
                    }

                    // Stop interval
                    function stopInterval() {
                        if (timerInterval) {
                            clearInterval(timerInterval);
                            timerInterval = null;
                        }
                    }

                    // Reset timer
                    function resetTimer() {
                        timerState = {
                            status: 'idle',
                            startTime: null,
                            elapsedMs: 0,
                            pausedMs: 0
                        };
                        timerDisplay.textContent = '00:00:00';
                        startBtn.textContent = '▶';
                        startBtn.title = 'Start timer';
                        updateUI();
                        saveTimerState();
                    }

                    // Start button handler
                    startBtn.addEventListener('click', () => {
                        if (timerState.status === 'idle') {
                            timerState.startTime = new Date().toISOString();
                            timerState.elapsedMs = 0;
                            timerState.status = 'running';
                        } else if (timerState.status === 'paused') {
                            // Resume: adjust start time to account for paused duration
                            const now = Date.now();
                            const pausedDuration = now - timerState.pausedMs;
                            timerState.startTime = new Date(now - timerState.elapsedMs).toISOString();
                            timerState.status = 'running';
                        }
                        startInterval();
                        updateUI();
                        saveTimerState();
                    });

                    // Pause button handler
                    pauseBtn.addEventListener('click', () => {
                        if (timerState.status === 'running') {
                            timerState.status = 'paused';
                            timerState.pausedMs = Date.now();
                            stopInterval();
                            updateUI();
                            saveTimerState();
                        }
                    });

                    // Stop button handler
                    stopBtn.addEventListener('click', () => {
                        stopInterval();

                        // Populate form with timer data
                        const startDate = new Date(timerState.startTime);
                        const endDate = new Date(startDate.getTime() + timerState.elapsedMs);

                        const workDateInput = document.querySelector('input[name="workDate"]');
                        const startTimeInput = document.querySelector('input[name="startTime"]');
                        const endTimeInput = document.querySelector('input[name="endTime"]');

                        if (workDateInput && startTimeInput && endTimeInput) {
                            // Format date as YYYY-MM-DD
                            const year = startDate.getFullYear();
                            const month = String(startDate.getMonth() + 1).padStart(2, '0');
                            const day = String(startDate.getDate()).padStart(2, '0');
                            workDateInput.value = year + '-' + month + '-' + day;

                            // Format times as HH:MM
                            const startHours = String(startDate.getHours()).padStart(2, '0');
                            const startMinutes = String(startDate.getMinutes()).padStart(2, '0');
                            startTimeInput.value = startHours + ':' + startMinutes;

                            const endHours = String(endDate.getHours()).padStart(2, '0');
                            const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
                            endTimeInput.value = endHours + ':' + endMinutes;

                            // Clear manual hours input
                            const manualHoursInput = document.querySelector('input[name="manualHours"]');
                            if (manualHoursInput) {
                                manualHoursInput.value = '';
                            }
                        }

                        // Reset timer
                        resetTimer();
                        localStorage.removeItem('timerState');

                        // Focus on submit button
                        const submitBtn = document.querySelector('.card form button[type="submit"]');
                        if (submitBtn) {
                            submitBtn.focus();
                        }
                    });

                    // Initialize timer on page load
                    loadTimerState();
                }

                // Register service worker for PWA
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('/service-worker.js')
                        .catch(err => console.error('SW registration failed:', err));
                }
            </script>
        </body>
        </html>
    `;
    res.send(html);
  } catch (error) {
    console.error("Error in /api route:", error);
    res.status(500).send("Internal Server Error");
  }
});

// LOGIC HELPERS
const getTimes = (body) => {
  const { workDate, startTime, endTime, manualHours, note } = body;

  // Validate workDate
  if (!isValidDate(workDate)) {
    throw new Error("Invalid work date format");
  }

  // Process note - trim and limit length, null if empty
  const processedNote = note?.trim()?.slice(0, 500) || null;

  if (manualHours) {
    // Validate manual hours
    if (!isValidNumber(manualHours, 0, 24)) {
      throw new Error("Invalid manual hours (must be between 0 and 24)");
    }
    const d = new Date(`${workDate}T12:00:00`);
    return {
      hours: cleanNum(Number.parseFloat(manualHours)),
      start: d,
      end: d,
      note: processedNote,
    };
  }

  // Validate time inputs
  if (!startTime || !endTime) {
    throw new Error("Both start and end times are required");
  }
  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    throw new Error("Invalid time format (must be HH:MM)");
  }

  const start = new Date(`${workDate}T${startTime}:00`);
  let end = new Date(`${workDate}T${endTime}:00`);
  if (end < start) end.setDate(end.getDate() + 1);

  // Validate that duration is reasonable (not negative, not more than 24 hours)
  const hours = cleanNum((end - start) / 3600000);
  if (hours < 0 || hours > 24) {
    throw new Error("Invalid time range (must be between 0 and 24 hours)");
  }

  return { hours, start, end, note: processedNote };
};

// HANDLERS
app.post("/api/add", requireAuth, async (req, res) => {
  try {
    // Validate CSRF token
    if (!validateCSRFToken(req)) {
      return res.status(403).send("Invalid CSRF token");
    }

    // Validate and parse input
    const data = getTimes(req.body);

    // Create log entry
    await prisma.log.create({ data: { ...data, userId: req.user.id } });
    res.redirect("/api");
  } catch (error) {
    console.error("Error in /api/add:", error);
    res.status(400).send(sanitizeError(error, isProd));
  }
});

app.post("/api/update/:id", requireAuth, async (req, res) => {
  try {
    // Validate CSRF token
    if (!validateCSRFToken(req)) {
      return res.status(403).send("Invalid CSRF token");
    }

    // Validate UUID
    if (!isValidUUID(req.params.id)) {
      return res.status(400).send("Invalid log ID");
    }

    // Validate and parse input
    const data = getTimes(req.body);

    // Update log (only if it belongs to user and is not locked)
    const result = await prisma.log.updateMany({
      where: { id: req.params.id, userId: req.user.id, rmpId: null },
      data,
    });

    if (result.count === 0) {
      return res.status(404).send("Log entry not found or locked");
    }

    res.redirect("/api");
  } catch (error) {
    console.error("Error in /api/update:", error);
    res.status(400).send(sanitizeError(error, isProd));
  }
});

app.post("/api/submit-unit", requireAuth, async (req, res) => {
  try {
    // Validate CSRF token
    if (!validateCSRFToken(req)) {
      return res.status(403).send("Invalid CSRF token");
    }

    // Validate filedDate
    if (!isValidDate(req.body.filedDate)) {
      return res.status(400).send("Invalid filing date format");
    }

    const earned = await prisma.log.findMany({
      where: { userId: req.user.id, rmpId: null },
      orderBy: { start: "asc" },
    });
    const totalHours = earned.reduce((s, l) => s + l.hours, 0);

    if (totalHours >= 3) {
      await prisma.$transaction(async (tx) => {
        // Parse date string (YYYY-MM-DD) and create at UTC midnight for timezone independence
        const [year, month, day] = req.body.filedDate.split("-").map(Number);
        const filedDate = new Date(Date.UTC(year, month - 1, day));

        // Collect notes from logs that will be bundled
        const bundledNotes = [];
        let needed = 3;
        for (const log of earned) {
          if (needed <= 0) break;
          if (log.note) {
            bundledNotes.push(log.note);
          }
          needed = log.hours <= needed ? cleanNum(needed - log.hours) : 0;
        }

        // Create RMP with summarized notes as bullet list
        const notes = bundledNotes.length > 0 ? bundledNotes.map((n) => `• ${n}`).join("\n") : null;
        const rmp = await tx.rmp.create({ data: { userId: req.user.id, filedDate, notes } });

        needed = 3;
        for (const log of earned) {
          if (needed <= 0) break;
          if (log.hours <= needed) {
            needed = cleanNum(needed - log.hours);
            await tx.log.update({ where: { id: log.id }, data: { rmpId: rmp.id } });
          } else {
            const remainder = cleanNum(log.hours - needed);
            await tx.log.update({ where: { id: log.id }, data: { hours: needed, rmpId: rmp.id } });
            await tx.log.create({
              data: {
                userId: req.user.id,
                hours: remainder,
                start: log.start,
                end: log.end,
                note: log.note,
              },
            });
            needed = 0;
          }
        }
      });
    }
    res.redirect("/api");
  } catch (error) {
    console.error("Error in /api/submit-unit:", error);
    res.status(400).send(sanitizeError(error, isProd));
  }
});

app.post("/api/rmp/toggle-paid/:id", requireAuth, async (req, res) => {
  try {
    // Validate CSRF token
    if (!validateCSRFToken(req)) {
      return res.status(403).send("Invalid CSRF token");
    }

    // Validate UUID
    if (!isValidUUID(req.params.id)) {
      return res.status(400).send("Invalid RMP ID");
    }

    // Check authorization - verify RMP belongs to user
    const rmp = await prisma.rmp.findUnique({ where: { id: req.params.id } });
    if (!rmp) {
      return res.status(404).send("RMP not found");
    }
    if (rmp.userId !== req.user.id) {
      return res.status(403).send("Unauthorized");
    }

    // Update status
    await prisma.rmp.update({
      where: { id: rmp.id },
      data: { status: rmp.status === "paid" ? "submitted" : "paid" },
    });
    res.redirect("/api");
  } catch (error) {
    console.error("Error in /api/rmp/toggle-paid:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/api/rmp/delete/:id", requireAuth, async (req, res) => {
  try {
    // Validate CSRF token
    if (!validateCSRFToken(req)) {
      return res.status(403).send("Invalid CSRF token");
    }

    // Validate UUID
    if (!isValidUUID(req.params.id)) {
      return res.status(400).send("Invalid RMP ID");
    }

    // Check authorization - verify RMP belongs to user
    const rmp = await prisma.rmp.findUnique({ where: { id: req.params.id } });
    if (!rmp) {
      return res.status(404).send("RMP not found");
    }
    if (rmp.userId !== req.user.id) {
      return res.status(403).send("Unauthorized");
    }

    await prisma.$transaction(async (tx) => {
      await tx.rmp.delete({ where: { id: req.params.id } });
      // Consolidation: Merge logs with identical start/end/user that are now unbundled
      const logs = await tx.log.findMany({
        where: { userId: req.user.id, rmpId: null },
        orderBy: { start: "asc" },
      });
      for (let i = 0; i < logs.length - 1; i++) {
        const a = logs[i];
        const b = logs[i + 1];
        if (a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime()) {
          await tx.log.update({
            where: { id: a.id },
            data: { hours: cleanNum(a.hours + b.hours) },
          });
          await tx.log.delete({ where: { id: b.id } });
          logs.splice(i + 1, 1);
          i--;
        }
      }
    });
    res.redirect("/api");
  } catch (error) {
    console.error("Error in /api/rmp/delete:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/api/delete/:id", requireAuth, async (req, res) => {
  try {
    // Validate CSRF token
    if (!validateCSRFToken(req)) {
      return res.status(403).send("Invalid CSRF token");
    }

    // Validate UUID
    if (!isValidUUID(req.params.id)) {
      return res.status(400).send("Invalid log ID");
    }

    // Delete log (only if it belongs to user and is not locked)
    const result = await prisma.log.deleteMany({
      where: { id: req.params.id, userId: req.user.id, rmpId: null },
    });

    if (result.count === 0) {
      return res.status(404).send("Log entry not found or locked");
    }

    res.redirect("/api");
  } catch (error) {
    console.error("Error in /api/delete:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/auth/google", authRateLimiter, (req, res, next) => {
  // Log auth attempt
  console.log(`[SECURITY] OAuth initiation from IP: ${req.ip || req.connection.remoteAddress}`);
  // Intercept redirect to ensure cache headers are set
  const originalRedirect = res.redirect;
  res.redirect = function (url) {
    this.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Vercel-CDN-Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    return originalRedirect.call(this, url);
  };
  // Set cache headers before Passport redirects
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Vercel-CDN-Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });

  // Capture the origin URL for redirect after OAuth completes
  // This enables preview branch deployments to work with OAuth
  const protocol = req.protocol;
  const host = req.get("host");
  const returnUrl = `${protocol}://${host}/api`;
  const state = Buffer.from(JSON.stringify({ returnUrl })).toString("base64url");

  passport.authenticate("google", {
    scope: ["profile", "email"],
    state,
  })(req, res, next);
});

app.get("/api/auth/callback", (req, res, next) => {
  // Set cache headers before Passport processes callback
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Vercel-CDN-Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });

  // Decode the state parameter to get the return URL
  let returnUrl = "/api";
  if (req.query.state) {
    try {
      const state = JSON.parse(Buffer.from(req.query.state, "base64url").toString());
      if (state.returnUrl && isValidRedirectUrl(state.returnUrl)) {
        returnUrl = state.returnUrl;
        console.log(`[SECURITY] OAuth callback will redirect to: ${returnUrl}`);
      } else if (state.returnUrl) {
        console.warn(`[SECURITY] Rejected invalid redirect URL: ${state.returnUrl}`);
      }
    } catch (e) {
      console.warn("[SECURITY] Failed to decode OAuth state:", e.message);
    }
  }

  // Use custom callback to ensure session is saved before redirecting
  passport.authenticate("google", (err, user, _info) => {
    if (err) {
      console.error("[SECURITY] OAuth error:", err);
      console.warn(
        `[SECURITY] Failed OAuth callback from IP: ${req.ip || req.connection.remoteAddress}`,
      );
      return res.redirect("/api");
    }
    if (!user) {
      console.warn(
        `[SECURITY] OAuth callback failed - no user from IP: ${req.ip || req.connection.remoteAddress}`,
      );
      return res.redirect("/api");
    }
    // Regenerate session to prevent session fixation attacks
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error("[SECURITY] Session regeneration error:", regenErr);
        return res.redirect("/api");
      }
      // Log in the user after session regeneration
      req.logIn(user, { session: true }, (loginErr) => {
        if (loginErr) {
          console.error("[SECURITY] Login error:", loginErr);
          return res.redirect("/api");
        }
        // Log successful authentication
        console.log(
          `[SECURITY] Successful authentication for user: ${user.id || user.emails?.[0]?.value || "unknown"} from IP: ${req.ip || req.connection.remoteAddress}`,
        );
        // Explicitly save session to ensure cookie is set before redirect
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[SECURITY] Session save error:", saveErr);
            return res.redirect("/api");
          }
          // Set cache headers on redirect response
          res.set({
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "Vercel-CDN-Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          });

          // If redirecting cross-origin (e.g., to a preview branch), include auth token
          // so the target can create its own session via /api/auth/token
          let finalUrl = returnUrl;
          if (returnUrl !== "/api") {
            try {
              const currentHost = req.get("host");
              const targetUrl = new URL(returnUrl);
              if (targetUrl.hostname !== currentHost) {
                const token = createAuthToken(user);
                // Redirect to /api/auth/token on the target with the token
                targetUrl.pathname = "/api/auth/token";
                targetUrl.searchParams.set("token", token);
                finalUrl = targetUrl.toString();
                console.log(
                  `[SECURITY] Cross-origin redirect with auth token to: ${targetUrl.hostname}`,
                );
              }
            } catch (e) {
              console.warn("[SECURITY] Failed to process cross-origin redirect:", e.message);
            }
          }

          res.redirect(finalUrl);
        });
      });
    });
  })(req, res, next);
});

// Handle cross-origin auth token for preview branch OAuth flow
// This endpoint receives a signed token from prod after OAuth completes,
// verifies it, and creates a local session in the preview branch's database
app.get("/api/auth/token", authRateLimiter, (req, res) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Vercel-CDN-Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });

  const token = req.query.token;
  if (!token) {
    console.warn("[SECURITY] /api/auth/token called without token");
    return res.redirect("/api");
  }

  const user = verifyAuthToken(token);
  if (!user) {
    console.warn("[SECURITY] /api/auth/token received invalid token");
    return res.redirect("/api");
  }

  console.log(`[SECURITY] Creating session from auth token for user: ${user.id}`);

  req.logIn(user, { session: true }, (err) => {
    if (err) {
      console.error("[SECURITY] Token login error:", err);
      return res.redirect("/api");
    }
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error("[SECURITY] Token session save error:", saveErr);
      }
      // Redirect to main app
      res.redirect("/api");
    });
  });
});

app.get("/api/logout", (req, res) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Vercel-CDN-Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  req.logout(() => res.redirect("/api"));
});

app.get("/api/changelog", (req, res) => {
  try {
    const changelogPath = path.join(__dirname, "..", "CHANGELOG.md");
    const changelog = fs.readFileSync(changelogPath, "utf-8");

    // Convert markdown to HTML (simple conversion)
    // Note: Using replace() with regex flags is correct here - replaceAll() doesn't support flags
    const lines = changelog.split("\n");
    let html = "";
    let inList = false;

    for (const line of lines) {
      if (line.startsWith("# ")) {
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        html += `<h1>${line.substring(2)}</h1>`;
      } else if (line.startsWith("## ")) {
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        html += `<h2>${line.substring(3)}</h2>`;
      } else if (line.startsWith("### ")) {
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        html += `<h3>${line.substring(4)}</h3>`;
      } else if (line.startsWith("- ")) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += `<li>${line.substring(2)}</li>`;
      } else if (line.trim() === "") {
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        html += "<p></p>";
      } else {
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        html += `<p>${line}</p>`;
      }
    }
    if (inList) {
      html += "</ul>";
    }

    res.set({
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/html; charset=utf-8",
    });

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Changelog - Three Bells</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #002447 0%, #003d6b 50%, #002447 100%);
            min-height: 100vh;
            padding: 20px;
            color: #333;
          }
          .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 800px;
            margin: 0 auto;
            padding: 40px;
            animation: fadeIn 0.6s ease-out;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          h1 {
            color: #002447;
            margin-bottom: 30px;
            font-size: 2.5em;
            border-bottom: 3px solid #002447;
            padding-bottom: 10px;
          }
          h2 {
            color: #002447;
            margin-top: 30px;
            margin-bottom: 15px;
            font-size: 1.8em;
          }
          h3 {
            color: #003d6b;
            margin-top: 20px;
            margin-bottom: 10px;
            font-size: 1.3em;
          }
          ul {
            margin-left: 20px;
            margin-bottom: 15px;
          }
          li {
            margin-bottom: 8px;
            line-height: 1.6;
          }
          p {
            margin-bottom: 15px;
            line-height: 1.6;
          }
          .back-link {
            display: inline-block;
            margin-bottom: 20px;
            color: #002447;
            text-decoration: none;
            font-weight: 600;
            padding: 10px 20px;
            border: 2px solid #002447;
            border-radius: 8px;
            transition: all 0.2s;
          }
          .back-link:hover {
            background: #002447;
            color: white;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <a href="/api" class="back-link">← Back to Dashboard</a>
          ${html}
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Error reading changelog:", error);
    res.status(500).send("Error loading changelog");
  }
});

module.exports = app;
