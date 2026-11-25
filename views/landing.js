const { layout } = require("./layout");
const { icon } = require("./icons");
const { assetUrl } = require("../lib/assets");

const GOOGLE_LOGO = `<svg class="google-logo" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
</svg>`;

function renderLanding() {
  const feature = (name, title, text) => `
    <li class="feature">
      <span class="feature-icon">${icon(name, { size: 20 })}</span>
      <span><strong>${title}</strong><span>${text}</span></span>
    </li>`;

  return layout({
    title: "Three Bells - Navy Reserve RMP Tracker",
    description:
      "Track and manage your Navy Reserve RMP (Reserve Manpower Program) training hours. Log hours, bundle into RMPs, and track payment status.",
    bodyClass: "landing",
    head: `<script src="${assetUrl("sw-register.js")}" defer></script>`,
    body: `
<main class="landing-card">
  <div class="landing-mark">${icon("bell", { size: 36 })}</div>
  <h1>Three Bells</h1>
  <p class="landing-sub">Track Navy Reserve RMP hours, from the first minute to the paid check.</p>
  <a href="/api/auth/google" class="btn btn-google">${GOOGLE_LOGO}<span>Sign in with Google</span></a>
  <ul class="features">
    ${feature("clock", "Log time", "Run a timer or enter hours by hand.")}
    ${feature("package", "Bundle RMPs", "Every 3 hours becomes a ready-to-file RMP.")}
    ${feature("check", "Track payment", "See what's pending and what's been paid.")}
  </ul>
</main>`,
  });
}

module.exports = { renderLanding };
