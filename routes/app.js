// Dashboard page and the actions on it.
//
// Every mutation works two ways:
//  - htmx requests (HX-Request: true) get HTML fragments back: the regions that
//    changed (as out-of-band swaps) plus a toast. Nothing reloads and the scroll
//    position is kept.
//  - Plain form posts (no JavaScript) get a redirect back to the dashboard.
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const prisma = require("../lib/db");
const {
  isHtmx,
  setNoCache,
  requireAuth,
  requireCSRF,
  getCSRFToken,
  sanitizeError,
} = require("../lib/security");
const { ValidationError, isValidUUID, isValidDate, isValidNumber } = require("../lib/validation");
const { parseLogInput, formatHours, toDateInput } = require("../lib/time");
const { getDashboardData, bundleRmps, unbundleRmp, togglePaid } = require("../lib/rmp");
const { renderLanding } = require("../views/landing");
const { renderChangelog } = require("../views/changelog");
const views = require("../views/dashboard");
const packageJson = require("../package.json");

const router = express.Router();

const todayUtc = () => toDateInput(new Date());

/** Respond to a successful mutation. */
async function respond(req, res, { toast, toastOpts, trigger } = {}) {
  if (!isHtmx(req)) return res.redirect("/");
  const data = await getDashboardData(req.user.id);
  const html =
    views.renderRegions(data, { csrfToken: getCSRFToken(req), todayStr: todayUtc() }) +
    (toast ? views.renderToast(toast, toastOpts) : "");
  res.set("HX-Reswap", "none");
  // After settle: the handler may replace the form that issued the request.
  if (trigger) res.set("HX-Trigger-After-Settle", trigger);
  res.send(html);
}

/** Plain-text error (htmx shows it as a toast). */
function fail(res, status, error) {
  if (!(error instanceof ValidationError) && typeof error !== "string") console.error(error);
  res
    .status(status)
    .type("text/plain")
    .send(typeof error === "string" ? error : sanitizeError(error));
}

const withValidId = (req, res, next) => {
  if (!isValidUUID(req.params.id)) return fail(res, 400, "Invalid ID");
  next();
};

const findOpenLog = (req) =>
  prisma.log.findFirst({ where: { id: req.params.id, userId: req.user.id, rmpId: null } });

// ---- Pages ----

// Old page URLs, kept so bookmarks and installed apps still work.
router.get("/api", (req, res) => {
  setNoCache(res);
  res.redirect("/");
});
router.get("/api/changelog", (req, res) => res.redirect("/changelog"));

router.get("/", async (req, res) => {
  setNoCache(res);
  try {
    if (!req.isAuthenticated?.()) return res.send(renderLanding());
    const data = await getDashboardData(req.user.id);
    res.send(
      views.renderDashboard({
        data,
        user: req.user,
        csrfToken: getCSRFToken(req),
        todayStr: todayUtc(),
        version: packageJson.version,
      }),
    );
  } catch (error) {
    console.error("Error in /api route:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/changelog", (req, res) => {
  try {
    const markdown = fs.readFileSync(path.join(__dirname, "..", "CHANGELOG.md"), "utf-8");
    res.set({ "Cache-Control": "public, max-age=3600" });
    res.type("html").send(renderChangelog(markdown));
  } catch (error) {
    console.error("Error reading changelog:", error);
    res.status(500).send("Error loading changelog");
  }
});

// ---- Log partials (inline editing) ----

router.get("/api/logs/:id", requireAuth, withValidId, async (req, res) => {
  try {
    const log = await prisma.log.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!log) return fail(res, 404, "Entry not found");
    const rmpById = new Map();
    if (log.rmpId) {
      const rmp = await prisma.rmp.findUnique({ where: { id: log.rmpId } });
      if (rmp) rmpById.set(rmp.id, rmp);
    }
    res.send(views.renderLogRow(log, rmpById));
  } catch (error) {
    fail(res, 500, error);
  }
});

router.get("/api/logs/:id/edit", requireAuth, withValidId, async (req, res) => {
  try {
    const log = await findOpenLog(req);
    if (!log) return fail(res, 404, "This entry can't be edited (it may be bundled).");
    res.send(views.renderLogEditor(log, { csrfToken: getCSRFToken(req) }));
  } catch (error) {
    fail(res, 500, error);
  }
});

// ---- Log mutations ----

router.post("/api/add", requireAuth, requireCSRF, async (req, res) => {
  let data;
  try {
    data = parseLogInput(req.body);
  } catch (error) {
    if (isHtmx(req) && error instanceof ValidationError) {
      return res.status(422).send(
        views.renderEntryForm({
          csrfToken: getCSRFToken(req),
          values: req.body,
          error: error.message,
        }),
      );
    }
    return fail(res, 400, error);
  }
  try {
    await prisma.log.create({ data: { ...data, userId: req.user.id } });
    await respond(req, res, {
      toast: `Logged ${formatHours(data.hours)} hrs`,
      trigger: "entry-saved",
    });
  } catch (error) {
    fail(res, 500, error);
  }
});

router.post("/api/update/:id", requireAuth, requireCSRF, withValidId, async (req, res) => {
  try {
    const log = await findOpenLog(req);
    if (!log) return fail(res, 404, "This entry can't be edited (it may be bundled).");
    let data;
    try {
      data = parseLogInput(req.body);
    } catch (error) {
      if (isHtmx(req) && error instanceof ValidationError) {
        return res.status(422).send(
          views.renderLogEditor(log, {
            csrfToken: getCSRFToken(req),
            values: req.body,
            error: error.message,
          }),
        );
      }
      throw error;
    }
    await prisma.log.update({ where: { id: log.id }, data });
    await respond(req, res, { toast: "Entry updated" });
  } catch (error) {
    fail(res, error instanceof ValidationError ? 400 : 500, error);
  }
});

router.post("/api/delete/:id", requireAuth, requireCSRF, withValidId, async (req, res) => {
  try {
    const log = await findOpenLog(req);
    if (!log) return fail(res, 404, "Entry not found or already bundled");
    await prisma.log.delete({ where: { id: log.id } });
    await respond(req, res, {
      toast: `Deleted ${formatHours(log.hours)} hr entry`,
      toastOpts: {
        undo: {
          url: "/api/logs/restore",
          vals: {
            hours: log.hours,
            start: log.start.toISOString(),
            end: log.end.toISOString(),
            note: log.note || "",
          },
        },
      },
    });
  } catch (error) {
    fail(res, 500, error);
  }
});

// Undo for delete: recreate a log from its stored values.
router.post("/api/logs/restore", requireAuth, requireCSRF, async (req, res) => {
  try {
    const { hours, start, end, note } = req.body;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (
      !isValidNumber(hours, 0, 24) ||
      Number.parseFloat(hours) <= 0 ||
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate < startDate ||
      endDate - startDate > 24 * 3600000
    ) {
      throw new ValidationError("Couldn't restore that entry.");
    }
    await prisma.log.create({
      data: {
        userId: req.user.id,
        hours: Number.parseFloat(hours),
        start: startDate,
        end: endDate,
        note: typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null,
      },
    });
    await respond(req, res, { toast: "Entry restored" });
  } catch (error) {
    fail(res, error instanceof ValidationError ? 400 : 500, error);
  }
});

// ---- RMP mutations ----

router.post("/api/submit-unit", requireAuth, requireCSRF, async (req, res) => {
  try {
    if (!isValidDate(req.body.filedDate)) {
      throw new ValidationError("Enter a valid filing date.");
    }
    const count = req.body.count === undefined ? 1 : Number.parseInt(req.body.count, 10);
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      throw new ValidationError("Invalid number of RMPs.");
    }
    const created = await bundleRmps(req.user.id, req.body.filedDate, count);
    if (created === 0) throw new ValidationError("You need at least 3 unbundled hours.");
    await respond(req, res, {
      toast: created === 1 ? "Bundled 1 RMP" : `Bundled ${created} RMPs`,
    });
  } catch (error) {
    fail(res, error instanceof ValidationError ? 400 : 500, error);
  }
});

router.post("/api/rmp/toggle-paid/:id", requireAuth, requireCSRF, withValidId, async (req, res) => {
  try {
    const status = await togglePaid(req.user.id, req.params.id);
    if (!status) return fail(res, 404, "RMP not found");
    await respond(req, res, {
      toast: status === "paid" ? "Marked as paid" : "Marked as pending",
      toastOpts: { undo: { url: `/api/rmp/toggle-paid/${req.params.id}` } },
    });
  } catch (error) {
    fail(res, 500, error);
  }
});

router.post("/api/rmp/delete/:id", requireAuth, requireCSRF, withValidId, async (req, res) => {
  try {
    const ok = await unbundleRmp(req.user.id, req.params.id);
    if (!ok) return fail(res, 404, "RMP not found");
    await respond(req, res, { toast: "RMP unsubmitted. Its hours are back in your balance." });
  } catch (error) {
    fail(res, 500, error);
  }
});

module.exports = router;
