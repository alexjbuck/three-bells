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
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

/** Only allow http(s) URLs (prevents javascript: and data: XSS in src/href). */
const escapeUrl = (str) => {
  if (!str) return null;
  const url = String(str).trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  return escapeHtml(url);
};

/** Error text that is safe to show. Validation messages are always shown. */
const sanitizeError = (error) => {
  if (error instanceof ValidationError) return error.message;
  if (!isProd) return error?.message || "Bad request";
  return "Something went wrong. Please try again.";
};

const isHtmx = (req) => req.get("HX-Request") === "true";

// ---- Auth ----

const requireAuth = (req, res, next) => {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    if (isHtmx(req)) {
      // Tell htmx to do a full navigation to the sign-in page.
      return res.set("HX-Redirect", "/api").status(401).send("Signed out");
    }
    return res.redirect("/api");
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

// ---- OAuth redirect + cross-origin token (preview deployments) ----

// Allows: localhost (dev), production URL, and this project's Vercel previews.
function isValidRedirectUrl(url) {
  try {
    const { hostname } = new URL(url);
    if (hostname === "localhost") return true;
    const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (prodUrl && hostname === prodUrl) return true;
    // three-bells-git-{branch}-alexjbucks-projects.vercel.app (branch deploys)
    // three-bells-{hash}-alexjbucks-projects.vercel.app (PR/commit deploys)
    if (hostname.endsWith(".vercel.app")) {
      return (
        hostname === "three-bells.vercel.app" ||
        (hostname.startsWith("three-bells-") && hostname.includes("-alexjbucks-projects"))
      );
    }
    return false;
  } catch {
    return false;
  }
}

const sign = (payloadStr) =>
  crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payloadStr).digest("base64url");

// Token format: base64url(payload).base64url(signature), 60 second expiry.
function createAuthToken(user) {
  const payload = {
    id: user.id,
    displayName: user.displayName,
    emails: user.emails,
    exp: Date.now() + 60 * 1000,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadStr}.${sign(payloadStr)}`;
}

function verifyAuthToken(token) {
  try {
    const [payloadStr, signature] = String(token).split(".");
    if (!payloadStr || !signature) return null;
    if (!safeEqual(signature, sign(payloadStr))) return null;
    const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString());
    if (payload.exp < Date.now()) {
      console.warn("[SECURITY] Auth token expired");
      return null;
    }
    return { id: payload.id, displayName: payload.displayName, emails: payload.emails };
  } catch (e) {
    console.warn("[SECURITY] Auth token verification failed:", e.message);
    return null;
  }
}

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
  isValidRedirectUrl,
  createAuthToken,
  verifyAuthToken,
  authRateLimiter,
};
