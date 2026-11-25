// Normalize the Postgres connection string's SSL mode for the pg driver.
//
// pg currently treats sslmode=prefer/require/verify-ca as aliases for verify-full (full
// certificate and hostname verification), and warns that its next major version will
// switch them to weaker libpq semantics. Neon connection strings, including the ones the
// Vercel integration writes for every preview branch, use sslmode=require. Asking for
// verify-full explicitly keeps today's behavior and silences the warning.
const UPGRADE = new Set(["prefer", "require", "verify-ca"]);

function normalizeDatabaseUrl(url) {
  if (!url) return url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const mode = parsed.searchParams.get("sslmode");
  if (!mode || !UPGRADE.has(mode) || parsed.searchParams.has("uselibpqcompat")) return url;
  parsed.searchParams.set("sslmode", "verify-full");
  return parsed.toString();
}

module.exports = { normalizeDatabaseUrl };
