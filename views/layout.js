const { assetUrl } = require("../lib/assets");
const { escapeHtml: h } = require("../lib/security");

/** Shared HTML document shell. `body`, `head` and `bodyAttrs` are trusted HTML. */
function layout({ title, description, body, head = "", bodyAttrs = "", bodyClass = "" }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="${h(description)}">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#0b2a4a">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Three Bells">
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <link rel="stylesheet" href="${assetUrl("app.css")}">
  <title>${h(title)}</title>
  ${head}
</head>
<body class="${bodyClass}" ${bodyAttrs}>
${body}
</body>
</html>`;
}

module.exports = { layout };
