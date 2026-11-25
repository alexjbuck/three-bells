// Dashboard views. Every region is a standalone render function so routes can
// return just the pieces that changed (htmx out-of-band swaps).
const { layout } = require("./layout");
const { icon } = require("./icons");
const { assetUrl } = require("../lib/assets");
const { escapeHtml: h, escapeUrl } = require("../lib/security");
const t = require("../lib/time");
const { RMP_HOURS } = require("../lib/rmp");

const RECENT_PAID_SHOWN = 3;
const OPEN_MONTHS = 2;

const oobAttr = (oob) => (oob ? ' hx-swap-oob="true"' : "");
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const csrfField = (csrfToken) => `<input type="hidden" name="_csrf" value="${h(csrfToken)}">`;

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function renderSummary(data, { oob = false, csrfToken, todayStr } = {}) {
  const { unbundledHours, readyRmps, towardNext } = data;
  const pct = Math.min(100, Math.round((towardNext / RMP_HOURS) * 100));
  const sub =
    readyRmps > 0
      ? `<strong>${plural(readyRmps, "RMP")} ready</strong> · ${t.formatHours(towardNext)} of ${RMP_HOURS} hrs toward the next`
      : `${t.formatHours(towardNext)} of ${RMP_HOURS} hrs toward your next RMP`;

  return `<section id="summary" class="summary" aria-label="Summary"${oobAttr(oob)}>
  <div class="hero">
    <div class="hero-main">
      <div class="hero-label">Unbundled balance</div>
      <div class="hero-value">${t.formatHours(unbundledHours)}<span class="hero-unit">hrs</span></div>
      <div class="progress" role="progressbar" aria-label="Progress toward next RMP" aria-valuemin="0" aria-valuemax="${RMP_HOURS}" aria-valuenow="${towardNext}"><span style="width:${pct}%"></span></div>
      <div class="hero-sub">${sub}</div>
    </div>
    <div class="hero-stats">
      <div class="mini">
        <div class="mini-value">${data.pendingCount}</div>
        <div class="mini-label">Pending</div>
        <div class="mini-sub">${data.pendingRecentCount} in last 30 days</div>
      </div>
      <div class="mini">
        <div class="mini-value">${data.paidCount}</div>
        <div class="mini-label">Paid</div>
        <div class="mini-sub">${t.formatHours(data.paidCount * RMP_HOURS)} hrs</div>
      </div>
    </div>
  </div>
  ${readyRmps > 0 ? renderBundleBar(readyRmps, csrfToken, todayStr) : ""}
</section>`;
}

function renderBundleBar(readyRmps, csrfToken, todayStr) {
  return `<form id="bundleBar" class="bundle-bar" action="/api/submit-unit" method="POST"
      hx-post="/api/submit-unit" hx-disabled-elt="find button">
    ${csrfField(csrfToken)}
    <div class="bundle-text">
      <span class="bundle-icon">${icon("package", { size: 20 })}</span>
      <div>
        <strong>${readyRmps === 1 ? "1 RMP is" : `${readyRmps} RMPs are`} ready to file</strong>
        <span>Your oldest hours are bundled first, 3 hours per RMP.</span>
      </div>
    </div>
    <div class="bundle-controls">
      <label class="field field-compact">
        <span class="field-label">EDM filing date</span>
        <input type="date" name="filedDate" value="${todayStr}" data-today required>
      </label>
      <div class="bundle-buttons">
        <button type="submit" name="count" value="1" class="btn btn-accent">Bundle 1</button>
        ${readyRmps > 1 ? `<button type="submit" name="count" value="${readyRmps}" class="btn btn-accent-soft">Bundle all ${readyRmps}</button>` : ""}
      </div>
    </div>
  </form>`;
}

// ---------------------------------------------------------------------------
// RMPs
// ---------------------------------------------------------------------------

function renderRmps(data, { oob = false } = {}) {
  const { rmps } = data;
  const pending = rmps.filter((r) => r.status !== "paid");
  const paid = rmps.filter((r) => r.status === "paid");
  const recentPaid = paid.slice(0, RECENT_PAID_SHOWN);
  const olderPaid = paid.slice(RECENT_PAID_SHOWN);

  let body;
  if (rmps.length === 0) {
    body = `<div class="empty">
      <span class="empty-icon">${icon("package", { size: 22 })}</span>
      <p><strong>No RMPs yet</strong>Once you've logged 3 hours you can bundle them into an RMP here.</p>
    </div>`;
  } else {
    body = `<div class="rmp-list">${[...pending, ...recentPaid].map(renderRmpCard).join("")}</div>
    ${
      olderPaid.length
        ? `<details class="more" data-keep="older-rmps">
            <summary>${icon("chevronDown", { size: 16, className: "chev" })} ${plural(olderPaid.length, "older paid RMP")}</summary>
            <div class="rmp-list">${olderPaid.map(renderRmpCard).join("")}</div>
          </details>`
        : ""
    }`;
  }

  return `<section id="rmps" class="section" aria-labelledby="rmpsTitle"${oobAttr(oob)}>
  <div class="section-head">
    <h2 id="rmpsTitle">RMPs</h2>
    <span class="section-meta">${rmps.length ? `${data.pendingCount} pending · ${data.paidCount} paid` : ""}</span>
  </div>
  ${body}
</section>`;
}

function renderRmpCard(r) {
  const isPaid = r.status === "paid";
  const hours = r.logs.reduce((s, l) => s + l.hours, 0);
  const firstNote = r.notes ? r.notes.split("\n")[0].replace(/^•\s*/, "") : "";

  return `<article id="rmp-${r.id}" class="rmp-card ${isPaid ? "is-paid" : "is-pending"}" style="view-transition-name: rmp-${r.id}">
  <div class="rmp-top">
    <div class="rmp-title">
      <span class="badge ${isPaid ? "badge-paid" : "badge-pending"}">${isPaid ? `${icon("check", { size: 12 })} Paid` : "Pending"}</span>
      <span class="rmp-date">Filed ${t.formatMediumDate(r.filedDate)}</span>
    </div>
    <div class="rmp-actions">
      <button type="button" class="btn btn-sm ${isPaid ? "btn-ghost" : "btn-success"}"
        hx-post="/api/rmp/toggle-paid/${r.id}" hx-disabled-elt="this">
        ${isPaid ? "Mark unpaid" : `${icon("check", { size: 16 })} Mark paid`}
      </button>
      <button type="button" class="icon-btn icon-btn-danger" title="Unsubmit RMP" aria-label="Unsubmit RMP filed ${t.formatMediumDate(r.filedDate)}"
        hx-post="/api/rmp/delete/${r.id}" hx-disabled-elt="this"
        hx-confirm="Unsubmit this RMP? Its ${t.formatHours(hours)} hours go back to your unbundled balance."
        data-confirm-label="Unsubmit">
        ${icon("undo")}
      </button>
    </div>
  </div>
  ${firstNote ? `<p class="rmp-note">${h(firstNote)}</p>` : ""}
  <details class="rmp-details" data-keep="rmp-${r.id}">
    <summary>${icon("chevronDown", { size: 16, className: "chev" })} ${t.formatHours(hours)} hrs from ${plural(r.logs.length, "entry", "entries")}</summary>
    <ul class="rmp-logs">
      ${r.logs
        .map(
          (l) => `<li>
            <span class="rmp-log-date">${t.formatMonthDay(l.start)}</span>
            <span class="rmp-log-note">${l.note ? h(l.note) : `<span class="muted">${timeLabel(l)}</span>`}</span>
            <span class="rmp-log-hours">${t.formatHours(l.hours)}h</span>
          </li>`,
        )
        .join("")}
    </ul>
    ${
      r.notes
        ? `<button type="button" class="btn btn-sm btn-ghost" data-copy="${h(r.notes)}">${icon("copy", { size: 16 })} Copy notes</button>`
        : ""
    }
  </details>
</article>`;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const timeLabel = (log) =>
  t.isManual(log) ? "Manual entry" : `${t.formatTime(log.start)} – ${t.formatTime(log.end)}`;

function renderHistory(data, { oob = false } = {}) {
  const { logs } = data;
  const groups = [];
  for (const log of logs) {
    const key = t.monthKey(log.start);
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      group = { key, label: t.formatMonth(log.start), logs: [], hours: 0, hasUnbundled: false };
      groups.push(group);
    }
    group.logs.push(log);
    group.hours += log.hours;
    if (!log.rmpId) group.hasUnbundled = true;
  }

  const body =
    groups.length === 0
      ? `<div class="empty">
          <span class="empty-icon">${icon("clock", { size: 22 })}</span>
          <p><strong>No entries yet</strong>Start the timer or add an entry to log your first hours.</p>
          <button type="button" class="btn btn-primary" data-open-entry>${icon("plus")} Add entry</button>
        </div>`
      : groups
          .map(
            (
              g,
              i,
            ) => `<details class="month" data-keep="month-${g.key}" ${i < OPEN_MONTHS || g.hasUnbundled ? "open" : ""}>
        <summary>
          ${icon("chevronDown", { size: 16, className: "chev" })}
          <span class="month-label">${g.label}</span>
          <span class="month-total">${t.formatHours(g.hours)} hrs</span>
        </summary>
        <div class="log-list">${g.logs.map((l) => renderLogRow(l, data.rmpById)).join("")}</div>
      </details>`,
          )
          .join("");

  return `<section id="history" class="section" aria-labelledby="historyTitle"${oobAttr(oob)}>
  <div class="section-head">
    <h2 id="historyTitle">History</h2>
    <button type="button" class="btn btn-sm btn-ghost" data-open-entry>${icon("plus", { size: 16 })} Add entry</button>
  </div>
  ${body}
</section>`;
}

function renderLogRow(log, rmpById) {
  const rmp = log.rmpId ? rmpById?.get(log.rmpId) : null;
  const actions = log.rmpId
    ? `<a class="chip" href="#rmp-${log.rmpId}" data-reveal-rmp title="Bundled into an RMP">
        ${icon("lock", { size: 13 })}<span>${rmp ? `Filed ${t.formatShortDate(rmp.filedDate)}` : "Bundled"}</span>
      </a>`
    : `<button type="button" class="icon-btn" title="Edit entry" aria-label="Edit entry"
          hx-get="/api/logs/${log.id}/edit" hx-target="closest .log-row" hx-swap="outerHTML">${icon("pencil")}</button>
        <button type="button" class="icon-btn icon-btn-danger" title="Delete entry" aria-label="Delete entry"
          hx-post="/api/delete/${log.id}" hx-disabled-elt="this">${icon("trash")}</button>`;

  return `<div id="log-${log.id}" class="log-row${log.rmpId ? " is-bundled" : ""}" style="view-transition-name: log-${log.id}">
  <div class="log-date" aria-label="${t.formatMediumDate(log.start)}">
    <span class="log-dow">${t.formatWeekday(log.start)}</span>
    <span class="log-day">${log.start.getUTCDate()}</span>
  </div>
  <div class="log-body">
    <div class="log-time">${timeLabel(log)}</div>
    ${log.note ? `<div class="log-note">${h(log.note)}</div>` : ""}
  </div>
  <div class="log-hours">${t.formatHours(log.hours)}<small>h</small></div>
  <div class="log-actions">${actions}</div>
</div>`;
}

// ---------------------------------------------------------------------------
// Entry forms (dialog + inline editor)
// ---------------------------------------------------------------------------

function renderEntryFields(v = {}, error = null) {
  const mode = v.mode === "manual" ? "manual" : "range";
  const today = !v.workDate;
  return `<div class="entry-fields">
  ${error ? `<p class="form-error" role="alert">${icon("alert", { size: 16 })}<span>${h(error)}</span></p>` : ""}
  <label class="field">
    <span class="field-label">Work date</span>
    <input type="date" name="workDate" value="${h(v.workDate || "")}" ${today ? "data-today" : ""} required>
  </label>
  <fieldset class="segmented">
    <legend class="sr-only">Entry type</legend>
    <label><input type="radio" name="mode" value="range" ${mode === "range" ? "checked" : ""}><span>Time range</span></label>
    <label><input type="radio" name="mode" value="manual" ${mode === "manual" ? "checked" : ""}><span>Manual hours</span></label>
  </fieldset>
  <div class="range-fields">
    <label class="field">
      <span class="field-label">Start</span>
      <input type="time" name="startTime" value="${h(v.startTime || "")}">
    </label>
    <label class="field">
      <span class="field-label">End</span>
      <input type="time" name="endTime" value="${h(v.endTime || "")}">
    </label>
    <output class="range-preview" data-range-preview aria-live="polite"></output>
  </div>
  <div class="manual-fields">
    <label class="field">
      <span class="field-label">Hours</span>
      <input type="number" name="manualHours" value="${h(v.manualHours || "")}" step="any" min="0" max="24" inputmode="decimal" placeholder="e.g. 1.5">
    </label>
  </div>
  <label class="field">
    <span class="field-label">Note <span class="optional">optional</span></span>
    <input type="text" name="note" value="${h(v.note || "")}" maxlength="${t.MAX_NOTE_LENGTH}" placeholder="What did you work on?" autocomplete="off">
  </label>
</div>`;
}

function renderEntryForm({ csrfToken, values = {}, error = null } = {}) {
  return `<form id="entryForm" class="sheet-form" action="/api/add" method="POST"
    hx-post="/api/add" hx-target="this" hx-swap="outerHTML" hx-disabled-elt="find button[type=submit]">
  <header class="sheet-head">
    <h2 id="entryTitle">Log hours</h2>
    <button type="button" class="icon-btn" data-close-dialog aria-label="Close">${icon("x")}</button>
  </header>
  ${csrfField(csrfToken)}
  ${renderEntryFields(values, error)}
  <footer class="sheet-foot">
    <button type="button" class="btn btn-ghost" data-close-dialog>Cancel</button>
    <button type="submit" class="btn btn-primary">Log hours</button>
  </footer>
</form>`;
}

function renderLogEditor(log, { csrfToken, values, error = null } = {}) {
  const v = values || t.logToFormValues(log);
  return `<form id="log-${log.id}" class="log-row is-editing" style="view-transition-name: log-${log.id}"
    action="/api/update/${log.id}" method="POST"
    hx-post="/api/update/${log.id}" hx-target="this" hx-swap="outerHTML" hx-disabled-elt="find button">
  ${csrfField(csrfToken)}
  ${renderEntryFields(v, error)}
  <div class="editor-actions">
    <button type="button" class="btn btn-ghost" data-cancel-edit hx-disabled-elt="this"
      hx-get="/api/logs/${log.id}" hx-target="closest .log-row" hx-swap="outerHTML">Cancel</button>
    <button type="submit" class="btn btn-primary">Save</button>
  </div>
</form>`;
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

/** An out-of-band toast. `undo` is { url, vals } for a POST that reverts the action. */
function renderToast(message, { undo, tone = "default" } = {}) {
  const undoBtn = undo
    ? `<button type="button" class="toast-action" hx-post="${h(undo.url)}" ${undo.vals ? `hx-vals="${h(JSON.stringify(undo.vals))}"` : ""}>${icon("undo", { size: 15 })} Undo</button>`
    : "";
  return `<div hx-swap-oob="beforeend:#toasts"><div class="toast toast-${tone}" role="status">
  <span class="toast-msg">${h(message)}</span>${undoBtn}
  <button type="button" class="toast-close" aria-label="Dismiss">${icon("x", { size: 16 })}</button>
</div></div>`;
}

/** All data-driven regions, for out-of-band refresh after a mutation. */
function renderRegions(data, opts) {
  return (
    renderSummary(data, { ...opts, oob: true }) +
    renderRmps(data, { oob: true }) +
    renderHistory(data, { oob: true })
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function renderDashboard({ data, user, csrfToken, todayStr, version }) {
  const displayName = user.displayName || "User";
  const email = user.emails?.[0]?.value || "";
  const photoUrl = escapeUrl(user.photos?.[0]?.value);
  const initial = (user.displayName || email || "U")[0].toUpperCase();

  const avatar = photoUrl
    ? `<img src="${photoUrl}" alt="" class="avatar" referrerpolicy="no-referrer">`
    : `<span class="avatar avatar-initial">${h(initial)}</span>`;

  return layout({
    title: "Three Bells",
    description:
      "Three Bells Dashboard - Manage your Navy Reserve RMP training hours, view unbundled balance, track submitted RMPs, and log new training entries.",
    bodyClass: "app",
    bodyAttrs: `hx-headers="${h(JSON.stringify({ "X-CSRF-Token": csrfToken }))}"`,
    head: `
  <meta name="htmx-config" content='{"responseHandling":[{"code":"204","swap":false},{"code":"[23]..","swap":true},{"code":"422","swap":true},{"code":"[45]..","swap":false,"error":true}],"includeIndicatorStyles":false}'>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.css">
  <script src="${assetUrl("vendor/htmx-2.0.4.min.js")}" defer></script>
  <script src="https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.js.iife.js" defer></script>
  <script src="${assetUrl("sw-register.js")}" defer></script>
  <script src="${assetUrl("app.js")}" defer></script>`,
    body: `
<a class="skip-link" href="#main">Skip to content</a>
<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="/api" aria-label="Three Bells home">
      <span class="brand-mark">${icon("bell", { size: 18 })}</span>
      <span class="brand-name">Three Bells</span>
    </a>
    <div class="topbar-actions">
      <div id="timer" class="timer" data-state="idle" role="group" aria-label="Timer">
        <span class="timer-dot" aria-hidden="true"></span>
        <span class="timer-display" id="timerDisplay" role="timer">0:00:00</span>
        <button type="button" class="timer-btn timer-start" data-timer="start" title="Start timer" aria-label="Start timer">${icon("play", { size: 16 })}<span class="timer-start-label">Timer</span></button>
        <button type="button" class="timer-btn timer-pause" data-timer="pause" title="Pause timer" aria-label="Pause timer">${icon("pause", { size: 16 })}</button>
        <button type="button" class="timer-btn timer-stop" data-timer="stop" title="Stop and log" aria-label="Stop timer and log hours">${icon("stop", { size: 16 })}</button>
      </div>
      <button type="button" id="addEntryBtn" class="btn btn-primary btn-sm topbar-add" data-open-entry>${icon("plus", { size: 16 })} Add entry</button>
      <button type="button" id="installBtn" class="icon-btn" title="Install app" aria-label="Install app" hidden>${icon("download")}</button>
      <button type="button" id="helpBtn" class="icon-btn" title="Take the tour" aria-label="Take the tour">${icon("help")}</button>
      <div class="menu">
        <button type="button" id="profileBtn" class="avatar-btn" aria-haspopup="true" aria-expanded="false" aria-controls="profileMenu" aria-label="Account menu">${avatar}</button>
        <div id="profileMenu" class="menu-panel" hidden>
          <div class="menu-user">
            <div class="menu-name">${h(displayName)}</div>
            <div class="menu-email">${h(email)}</div>
          </div>
          <button type="button" class="menu-item" id="showTutorialLink">${icon("compass", { size: 16 })} Show tutorial</button>
          <a class="menu-item" href="/api/changelog">${icon("fileText", { size: 16 })} What's new <span class="menu-meta">v${h(version)}</span></a>
          <a class="menu-item" href="/api/logout">${icon("logout", { size: 16 })} Sign out</a>
        </div>
      </div>
    </div>
  </div>
</header>

<main id="main" class="page">
  ${renderSummary(data, { csrfToken, todayStr })}
  ${renderRmps(data)}
  ${renderHistory(data)}
  <footer class="page-foot">Three Bells v${h(version)} · <a href="/api/changelog">Changelog</a></footer>
</main>

<button type="button" id="fab" class="fab" data-open-entry aria-label="Add entry">${icon("plus", { size: 26 })}</button>

<dialog id="entryDialog" class="sheet" aria-labelledby="entryTitle">
  ${renderEntryForm({ csrfToken })}
</dialog>

<dialog id="confirmDialog" class="modal" aria-labelledby="confirmMessage">
  <form method="dialog">
    <p id="confirmMessage"></p>
    <div class="modal-actions">
      <button value="cancel" class="btn btn-ghost">Cancel</button>
      <button value="ok" id="confirmOk" class="btn btn-danger">Confirm</button>
    </div>
  </form>
</dialog>

<div id="toasts" class="toasts" aria-live="polite"></div>`,
  });
}

module.exports = {
  renderDashboard,
  renderSummary,
  renderRmps,
  renderHistory,
  renderLogRow,
  renderLogEditor,
  renderEntryForm,
  renderRegions,
  renderToast,
};
