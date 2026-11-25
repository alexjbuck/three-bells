const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeDatabaseUrl } = require("../lib/db-url");

const neon =
  "postgresql://user:p%40ss@ep-cool-123-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

test("require/prefer/verify-ca become verify-full, other params kept", () => {
  for (const mode of ["require", "prefer", "verify-ca"]) {
    const out = new URL(normalizeDatabaseUrl(neon.replace("sslmode=require", `sslmode=${mode}`)));
    assert.equal(out.searchParams.get("sslmode"), "verify-full");
    assert.equal(out.searchParams.get("channel_binding"), "require");
    assert.equal(out.password, "p%40ss");
    assert.equal(out.hostname, "ep-cool-123-pooler.us-east-2.aws.neon.tech");
  }
});

test("leaves other URLs untouched", () => {
  const unchanged = [
    "postgresql://postgres@localhost:54329/threebells",
    "postgresql://u@h/db?sslmode=disable",
    "postgresql://u@h/db?sslmode=verify-full",
    "postgresql://u@h/db?uselibpqcompat=true&sslmode=require",
    undefined,
    "",
    "not a url",
  ];
  for (const url of unchanged) assert.equal(normalizeDatabaseUrl(url), url);
});
