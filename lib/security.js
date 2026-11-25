// Security helpers: escaping, CSRF, auth middleware, signed cross-origin auth tokens.
const crypto = require("node:crypto");
const rateLimit = require("express-rate-limit");
const { ValidationError } = require("./validation");

const isProd = process.env.NODE_ENV === "production";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  "Vercel-CDN-Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};
const setNoCache = (res) => res.set(NO_CACHE_HEADERS);

/** HTML-escape a value for use in element content or a quoted attribute. */
const escapeHtml = (str) => {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/** Only allow http(s) URLs (prevents javascript: and data: XSS in src/href). */
const escapeUrl = (str) => {
  if (!str) return null;
  const url = String(str).trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  return escapeHtml(url);
};

/**
 * Error text that is safe to show. Only validation messages (written by us for users)
 * are passed through; anything else is logged server-side and replaced with a generic message.
 */
const sanitizeError = (error) =>
  error instanceof ValidationError ? error.message : "Something went wrong. Please try again.";

const isHtmx = (req) => req.get("HX-Request") === "true";

// ---- Auth ----

const requireAuth = (req, res, next) => {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    if (isHtmx(req)) {
      // Tell htmx to do a full navigation to the sign-in page.
      return res.set("HX-Redirect", "/").status(401).send("Signed out");
    }
    return res.redirect("/");
  }
  next();
};

// ---- CSRF ----

const getCSRFToken = (req) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
};

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/** Accepts the token from a form field or the X-CSRF-Token header (htmx). */
const validateCSRFToken = (req) => {
  const token = req.get("X-CSRF-Token") || req.body?._csrf || req.body?.csrfToken;
  const sessionToken = req.session?.csrfToken;
  return Boolean(token && sessionToken && safeEqual(token, sessionToken));
};

const requireCSRF = (req, res, next) => {
  if (!validateCSRFToken(req)) {
    return res.status(403).send("Your session expired. Reload the page and try again.");
  }
  next();
};

// OAuth state and preview hand-off tokens live in lib/auth-tokens.js.

const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`[SECURITY] Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).send("Too many requests");
  },
});

// Per-instance limit for app routes. On serverless each instance counts separately, so
// this is a backstop; Vercel's edge protection handles volumetric abuse.
const actionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`[SECURITY] Action rate limit exceeded for IP: ${req.ip}`);
    res.status(429).type("text/plain").send("Too many requests. Wait a moment and try again.");
  },
});

module.exports = {
  isProd,
  setNoCache,
  escapeHtml,
  escapeUrl,
  sanitizeError,
  isHtmx,
  requireAuth,
  getCSRFToken,
  validateCSRFToken,
  requireCSRF,
  authRateLimiter,
  actionRateLimiter,
};
