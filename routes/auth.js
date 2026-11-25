// Google OAuth, including the cross-origin token hand-off for preview deployments.
const express = require("express");
const passport = require("passport");
const {
  setNoCache,
  isValidRedirectUrl,
  createAuthToken,
  verifyAuthToken,
  authRateLimiter,
} = require("../lib/security");

const router = express.Router();

router.get("/api/auth/google", authRateLimiter, (req, res, next) => {
  console.log(`[SECURITY] OAuth initiation from IP: ${req.ip}`);
  setNoCache(res);
  // Make sure Passport's redirect also carries no-cache headers.
  const originalRedirect = res.redirect;
  res.redirect = function (url) {
    setNoCache(this);
    return originalRedirect.call(this, url);
  };

  // Remember where to return after OAuth so preview deployments work.
  const returnUrl = `${req.protocol}://${req.get("host")}/`;
  const state = Buffer.from(JSON.stringify({ returnUrl })).toString("base64url");
  passport.authenticate("google", { scope: ["profile", "email"], state })(req, res, next);
});

router.get("/api/auth/callback", (req, res, next) => {
  setNoCache(res);

  let returnUrl = "/";
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

  passport.authenticate("google", (err, user) => {
    if (err || !user) {
      if (err) console.error("[SECURITY] OAuth error:", err);
      console.warn(`[SECURITY] Failed OAuth callback from IP: ${req.ip}`);
      return res.redirect("/");
    }
    // Regenerate session to prevent session fixation attacks
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error("[SECURITY] Session regeneration error:", regenErr);
        return res.redirect("/");
      }
      req.logIn(user, { session: true }, (loginErr) => {
        if (loginErr) {
          console.error("[SECURITY] Login error:", loginErr);
          return res.redirect("/");
        }
        console.log(
          `[SECURITY] Successful authentication for user: ${user.id || "unknown"} from IP: ${req.ip}`,
        );
        // Save the session before redirecting so the cookie is set.
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[SECURITY] Session save error:", saveErr);
            return res.redirect("/");
          }
          setNoCache(res);

          // Cross-origin (preview branch): hand off a short-lived signed token.
          let finalUrl = returnUrl;
          if (returnUrl !== "/") {
            try {
              const targetUrl = new URL(returnUrl);
              if (targetUrl.hostname !== req.get("host")) {
                targetUrl.pathname = "/api/auth/token";
                targetUrl.searchParams.set("token", createAuthToken(user));
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

// Receives a signed token from production after OAuth and creates a local session.
router.get("/api/auth/token", authRateLimiter, (req, res) => {
  setNoCache(res);
  const user = req.query.token ? verifyAuthToken(req.query.token) : null;
  if (!user) {
    console.warn("[SECURITY] /api/auth/token received a missing or invalid token");
    return res.redirect("/");
  }
  console.log(`[SECURITY] Creating session from auth token for user: ${user.id}`);
  req.logIn(user, { session: true }, (err) => {
    if (err) {
      console.error("[SECURITY] Token login error:", err);
      return res.redirect("/");
    }
    req.session.save((saveErr) => {
      if (saveErr) console.error("[SECURITY] Token session save error:", saveErr);
      res.redirect("/");
    });
  });
});

router.get("/api/logout", (req, res) => {
  setNoCache(res);
  req.logout(() => res.redirect("/"));
});

module.exports = router;
