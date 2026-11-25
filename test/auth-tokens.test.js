const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  isValidRedirectUrl,
  createOAuthState,
  readOAuthState,
  createAuthToken,
  verifyAuthToken,
} = require("../lib/auth-tokens");

const PREVIEW = "https://three-bells-git-feature-alexjbucks-projects.vercel.app/api";
const PREVIEW_HOST = new URL(PREVIEW).host;
// Anyone can create a Vercel project with this name; its preview URLs look like ours.
const LOOKALIKE = "https://three-bells-x-alexjbucks-projects-abc123-evil.vercel.app/api";
const USER = { id: "123", displayName: "Sailor", emails: [{ value: "s@example.com" }] };

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret";
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "three-bells.example.com";
});

test("allowlist accepts our hosts and rejects lookalikes", () => {
  assert.ok(isValidRedirectUrl(PREVIEW));
  assert.ok(isValidRedirectUrl("https://three-bells.example.com/api"));
  assert.ok(isValidRedirectUrl("http://localhost:3000/api"));
  assert.ok(!isValidRedirectUrl(LOOKALIKE));
  assert.ok(!isValidRedirectUrl("http://three-bells-git-x-alexjbucks-projects.vercel.app/api"));
  assert.ok(!isValidRedirectUrl("https://evil.com/?three-bells-x-alexjbucks-projects.vercel.app"));
  assert.ok(!isValidRedirectUrl("javascript:alert(1)"));
  assert.ok(!isValidRedirectUrl("not a url"));
});

test("a signed state round-trips", () => {
  assert.equal(readOAuthState(createOAuthState(PREVIEW)), PREVIEW);
});

test("unsigned states are ignored (the old format an attacker could craft)", () => {
  const forged = Buffer.from(JSON.stringify({ returnUrl: PREVIEW })).toString("base64url");
  assert.equal(readOAuthState(forged), null);
  assert.equal(readOAuthState(`${forged}.not-a-signature`), null);
  assert.equal(readOAuthState(undefined), null);
  assert.equal(readOAuthState(["a", "b"]), null);
});

test("tampered or wrongly keyed states are rejected", () => {
  const [payload, sig] = createOAuthState(PREVIEW).split(".");
  const evilPayload = Buffer.from(JSON.stringify({ returnUrl: LOOKALIKE, exp: 9e15 })).toString(
    "base64url",
  );
  assert.equal(readOAuthState(`${evilPayload}.${sig}`), null);

  const state = `${payload}.${sig}`;
  process.env.SESSION_SECRET = "other-secret";
  assert.equal(readOAuthState(state), null);
});

test("expired states are rejected", () => {
  const issued = Date.now();
  const state = createOAuthState(PREVIEW, issued);
  assert.equal(readOAuthState(state, issued + 9 * 60 * 1000), PREVIEW);
  assert.equal(readOAuthState(state, issued + 11 * 60 * 1000), null);
});

test("a signed state still can't point at a disallowed host", () => {
  assert.equal(readOAuthState(createOAuthState(LOOKALIKE)), null);
});

test("tokens are only valid on the host they were issued for", () => {
  const token = createAuthToken(USER, PREVIEW_HOST);
  assert.deepEqual(verifyAuthToken(token, PREVIEW_HOST), USER);
  assert.equal(verifyAuthToken(token, "three-bells.example.com"), null);
  assert.equal(verifyAuthToken(token, undefined), null);
});

test("expired tokens are rejected", () => {
  const issued = Date.now();
  const token = createAuthToken(USER, PREVIEW_HOST, issued);
  assert.ok(verifyAuthToken(token, PREVIEW_HOST, issued + 59 * 1000));
  assert.equal(verifyAuthToken(token, PREVIEW_HOST, issued + 61 * 1000), null);
});

test("states and tokens can't be swapped for each other", () => {
  const state = createOAuthState(PREVIEW);
  assert.equal(verifyAuthToken(state, PREVIEW_HOST), null);
  const token = createAuthToken(USER, PREVIEW_HOST);
  assert.equal(readOAuthState(token), null);
});

test("signing without SESSION_SECRET fails loudly", () => {
  delete process.env.SESSION_SECRET;
  assert.throws(() => createOAuthState(PREVIEW), /SESSION_SECRET/);
});
