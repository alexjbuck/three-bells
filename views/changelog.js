const { layout } = require("./layout");
const { icon } = require("./icons");
const { escapeHtml: h } = require("../lib/security");

// Minimal markdown: headings, list items, paragraphs, `code` and **bold**.
const inline = (text) =>
  h(text)
    .replaceAll(/`([^`]+)`/g, "<code>$1</code>")
    .replaceAll(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

function markdownToHtml(md) {
  let html = "";
  let listDepth = 0;
  const closeLists = (to = 0) => {
    while (listDepth > to) {
      html += "</ul>";
      listDepth--;
    }
  };

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const listMatch = /^(\s*)- (.*)$/.exec(line);
    if (listMatch) {
      const depth = Math.floor(listMatch[1].length / 2) + 1;
      while (listDepth < depth) {
        html += "<ul>";
        listDepth++;
      }
      closeLists(depth);
      html += `<li>${inline(listMatch[2])}</li>`;
      continue;
    }
    if (line.trim() === "") continue;
    closeLists();
    if (line.startsWith("### ")) html += `<h3>${inline(line.slice(4))}</h3>`;
    else if (line.startsWith("## ")) html += `<h2>${inline(line.slice(3))}</h2>`;
    else if (line.startsWith("# "))
      continue; // package name; the page has its own title
    else html += `<p>${inline(line.trim())}</p>`;
  }
  closeLists();
  return html;
}

function renderChangelog(markdown) {
  return layout({
    title: "What's new - Three Bells",
    description: "Release notes for Three Bells.",
    bodyClass: "doc",
    body: `
<main class="doc-page">
  <a href="/api" class="back-link">${icon("arrowLeft", { size: 16 })} Back to dashboard</a>
  <h1>What's new</h1>
  <div class="prose">${markdownToHtml(markdown)}</div>
</main>`,
  });
}

module.exports = { renderChangelog, markdownToHtml };
