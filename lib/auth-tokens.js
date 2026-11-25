// Signed values for the Google OAuth hand-off to Vercel preview deployments.
//
// Google only accepts exact redirect URIs, and wildcards aren't allowed, so every
// deployment sends users through production's registered callback. Production then has
// to send preview users back to their preview. Two signed values make that safe:
//
//  1. OAuth state: the deployment that starts sign-in signs its return URL. Production
//     only redirects to a return URL with a valid signature, so nobody can craft a
//     sign-in link that sends users (and their auth token) to a host they control.
//  2. Auth token: production signs the user for one destination host. The receiving
//     deployment rejects tokens issued for any other host, so a leaked token can't be
//     replayed anywhere else, production included.
//
// All deployments share SESSION_SECRET. Each value type is signed under its own purpose
// label, so a state can never be passed off as a token or vice versa.
const crypto = require("node:crypto");

const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 60 * 1000;
const PREVIEW_HOST_PREFIX = "three-bells-";
const PREVIEW_HOST_SUFFIX = "-alexjbucks-projects.vercel.app";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not set");
  return value;
}

const sign = (purpose, payloadStr) =>
  crypto.createHmac("sha256", secret()).update(`${purpose}.${payloadStr}`).digest("base64url");

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/** Serialize and sign: base64url(json).signature */
function seal(purpose, payload) {
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadStr}.${sign(purpose, payloadStr)}`;
}

/** Verify signature and expiry; returns the payload or null. */
function unseal(purpose, value, now) {
  if (typeof value !== "string") return null;
  const parts = value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payloadStr, signature] = parts;
  if (!safeEqual(signature, sign(purpose, payloadStr))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString());
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || typeof payload.exp !== "number") return null;
  if (payload.exp < now) return null;
  return payload;
}

/**
 * Hosts we will send a signed-in user back to: localhost, production, and this project's
 * Vercel previews. This is defense in depth only: anyone can create a Vercel project whose
 * URLs look similar, which is why the return URL must also come from a signed state.
 */
function isValidRedirectUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (hostname === "localhost") return protocol === "http:" || protocol === "https:";
    if (protocol !== "https:") return false;
    const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (prodHost && hostname === prodHost) return true;
    return (
      hostname === "three-bells.vercel.app" ||
      (hostname.startsWith(PREVIEW_HOST_PREFIX) && hostname.endsWith(PREVIEW_HOST_SUFFIX))
    );
  } catch {
    return false;
  }
}

/** Created by the deployment that starts sign-in; passed through Google as `state`. */
function createOAuthState(returnUrl, now = Date.now()) {
  return seal("oauth-state", { returnUrl, exp: now + STATE_TTL_MS });
}

/** The return URL from a state we signed, or null if missing, forged, expired or not allowed. */
function readOAuthState(state, now = Date.now()) {
  const payload = unseal("oauth-state", state, now);
  if (!payload || typeof payload.returnUrl !== "string") return null;
  return isValidRedirectUrl(payload.returnUrl) ? payload.returnUrl : null;
}

/** Short-lived token proving who signed in, valid only on `audience` (a host, e.g. "x.vercel.app"). */
function createAuthToken(user, audience, now = Date.now()) {
  return seal("auth-token", {
    id: user.id,
    displayName: user.displayName,
    emails: user.emails,
    aud: audience,
    exp: now + TOKEN_TTL_MS,
  });
}

/** The user from a token issued for this host, or null. */
function verifyAuthToken(token, audience, now = Date.now()) {
  const payload = unseal("auth-token", token, now);
  if (!payload || !payload.id || typeof payload.aud !== "string" || payload.aud !== audience) {
    return null;
  }
  return { id: payload.id, displayName: payload.displayName, emails: payload.emails };
}

module.exports = {
  isValidRedirectUrl,
  createOAuthState,
  readOAuthState,
  createAuthToken,
  verifyAuthToken,
};
