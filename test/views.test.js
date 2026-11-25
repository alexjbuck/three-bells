const { test } = require("node:test");
const assert = require("node:assert/strict");
const views = require("../views/dashboard");
const { markdownToHtml } = require("../views/changelog");

const log = (overrides = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  userId: "u",
  hours: 2,
  start: new Date("2026-11-24T18:00:00Z"),
  end: new Date("2026-11-24T20:00:00Z"),
  note: null,
  rmpId: null,
  ...overrides,
});

const data = (logs = [], rmps = []) => ({
  logs,
  rmps,
  rmpById: new Map(rmps.map((r) => [r.id, r])),
  unbundledHours: 4,
  readyRmps: 1,
  towardNext: 1,
  pendingCount: rmps.length,
  pendingRecentCount: 0,
  paidCount: 0,
});

test("user notes are HTML-escaped", () => {
  const html = views.renderHistory(data([log({ note: '<img src=x onerror="alert(1)">' })]));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
});

test("bundled rows link to their RMP and have no edit controls", () => {
  const rmp = {
    id: "22222222-2222-4222-8222-222222222222",
    filedDate: new Date("2026-11-18T00:00:00Z"),
    status: "submitted",
    notes: null,
    logs: [],
  };
  const html = views.renderLogRow(log({ rmpId: rmp.id }), new Map([[rmp.id, rmp]]));
  assert.ok(html.includes(`href="#rmp-${rmp.id}"`));
  assert.ok(html.includes("Filed 11/18/2026"));
  assert.ok(!html.includes("hx-get"));
});

test("regions render as out-of-band swaps", () => {
  const html = views.renderRegions(data([log()]), { csrfToken: "abc", todayStr: "2026-11-25" });
  for (const id of ["summary", "rmps", "history"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*hx-swap-oob="true"`));
  }
  assert.ok(html.includes('name="_csrf" value="abc"'), "bundle bar carries CSRF token");
});

test("toast undo values are attribute-safe", () => {
  const html = views.renderToast("Deleted", {
    undo: { url: "/api/logs/restore", vals: { note: `"quoted" <b>` } },
  });
  assert.ok(html.includes('hx-swap-oob="beforeend:#toasts"'));
  assert.ok(!html.includes("<b>"));
  assert.ok(html.includes(String.raw`\&quot;quoted\&quot;`));
});

test("editor round-trips an existing manual log", () => {
  const html = views.renderLogEditor(
    log({ start: new Date("2026-11-24T12:00:00Z"), end: new Date("2026-11-24T12:00:00Z") }),
    { csrfToken: "abc" },
  );
  assert.match(html, /value="manual" checked/);
  assert.match(html, /name="manualHours" value="2"/);
});

test("changelog markdown is escaped and nested lists work", () => {
  const html = markdownToHtml("# pkg\n\n## 1.0.0\n\n- top `code`\n  - nested <script>\n");
  assert.ok(html.includes("<h2>1.0.0</h2>"));
  assert.ok(html.includes("<code>code</code>"));
  assert.ok(html.includes("<ul><li>top"));
  assert.ok(html.includes("<ul><li>nested &lt;script&gt;</li></ul>"));
  assert.ok(!html.includes("pkg"));
});
