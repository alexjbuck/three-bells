// Content-hashed URLs for files in /public so browsers and the service worker
// can cache them aggressively and still pick up changes on deploy.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const cache = new Map();

function assetUrl(file) {
  if (!cache.has(file)) {
    let version = "dev";
    try {
      const contents = fs.readFileSync(path.join(PUBLIC_DIR, file));
      version = crypto.createHash("sha256").update(contents).digest("hex").slice(0, 10);
    } catch (e) {
      console.warn(`[assets] Could not hash ${file}:`, e.message);
    }
    cache.set(file, `/${file}?v=${version}`);
  }
  return cache.get(file);
}

module.exports = { PUBLIC_DIR, assetUrl };
