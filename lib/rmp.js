// Data access for logs and RMPs.
const prisma = require("./db");
const { cleanNum } = require("./validation");

const RMP_HOURS = 3;
const RECENT_DAYS = 30;

/** Everything the dashboard renders, in one round trip. */
async function getDashboardData(userId) {
  const [logs, rmps] = await Promise.all([
    prisma.log.findMany({ where: { userId }, orderBy: { start: "desc" } }),
    prisma.rmp.findMany({
      where: { userId },
      orderBy: { filedDate: "desc" },
      include: { logs: { orderBy: { start: "asc" } } },
    }),
  ]);

  const unbundledHours = cleanNum(
    logs.filter((l) => !l.rmpId).reduce((sum, l) => sum + l.hours, 0),
  );
  const readyRmps = Math.floor(cleanNum(unbundledHours / RMP_HOURS));
  const towardNext = cleanNum(unbundledHours - readyRmps * RMP_HOURS);

  const recentCutoff = new Date();
  recentCutoff.setUTCDate(recentCutoff.getUTCDate() - RECENT_DAYS);
  recentCutoff.setUTCHours(0, 0, 0, 0);

  const pending = rmps.filter((r) => r.status !== "paid");
  const paid = rmps.filter((r) => r.status === "paid");

  return {
    logs,
    rmps,
    rmpById: new Map(rmps.map((r) => [r.id, r])),
    unbundledHours,
    readyRmps,
    towardNext,
    pendingCount: pending.length,
    pendingRecentCount: pending.filter((r) => r.filedDate >= recentCutoff).length,
    paidCount: paid.length,
  };
}

/** Bundle the oldest unbundled hours into one RMP. Returns null if < 3 hours. */
async function bundleOne(tx, userId, filedDate) {
  const earned = await tx.log.findMany({
    where: { userId, rmpId: null },
    orderBy: { start: "asc" },
  });
  const total = cleanNum(earned.reduce((s, l) => s + l.hours, 0));
  if (total < RMP_HOURS) return null;

  // Work out which logs participate (the last one may be split).
  const parts = [];
  let needed = RMP_HOURS;
  for (const log of earned) {
    if (needed <= 0) break;
    const take = Math.min(log.hours, needed);
    parts.push({ log, take });
    needed = cleanNum(needed - take);
  }

  const bundledNotes = parts.map((p) => p.log.note).filter(Boolean);
  const notes = bundledNotes.length > 0 ? bundledNotes.map((n) => `• ${n}`).join("\n") : null;
  const rmp = await tx.rmp.create({ data: { userId, filedDate, notes } });

  for (const { log, take } of parts) {
    if (take >= log.hours) {
      await tx.log.update({ where: { id: log.id }, data: { rmpId: rmp.id } });
    } else {
      // Split: the bundled part joins the RMP, the remainder stays unbundled.
      await tx.log.update({ where: { id: log.id }, data: { hours: take, rmpId: rmp.id } });
      await tx.log.create({
        data: {
          userId,
          hours: cleanNum(log.hours - take),
          start: log.start,
          end: log.end,
          note: log.note,
        },
      });
    }
  }
  return rmp;
}

/** Bundle up to `count` RMPs. Returns the number created. */
async function bundleRmps(userId, filedDateStr, count) {
  const [year, month, day] = filedDateStr.split("-").map(Number);
  const filedDate = new Date(Date.UTC(year, month - 1, day));
  return prisma.$transaction(
    async (tx) => {
      let created = 0;
      for (let i = 0; i < count; i++) {
        if (!(await bundleOne(tx, userId, filedDate))) break;
        created++;
      }
      return created;
    },
    { timeout: 20000 },
  );
}

/** Delete an RMP; its logs return to the unbundled pool and split logs re-merge. */
async function unbundleRmp(userId, rmpId) {
  return prisma.$transaction(async (tx) => {
    const rmp = await tx.rmp.findFirst({ where: { id: rmpId, userId } });
    if (!rmp) return false;
    await tx.rmp.delete({ where: { id: rmp.id } });

    // Merge unbundled logs with identical start/end (pieces of a split log).
    const logs = await tx.log.findMany({
      where: { userId, rmpId: null },
      orderBy: { start: "asc" },
    });
    for (let i = 0; i < logs.length - 1; i++) {
      const a = logs[i];
      const b = logs[i + 1];
      if (a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime()) {
        const hours = cleanNum(a.hours + b.hours);
        await tx.log.update({ where: { id: a.id }, data: { hours } });
        await tx.log.delete({ where: { id: b.id } });
        a.hours = hours;
        logs.splice(i + 1, 1);
        i--;
      }
    }
    return true;
  });
}

/** Flip an RMP between submitted and paid. Returns the new status or null. */
async function togglePaid(userId, rmpId) {
  const rmp = await prisma.rmp.findFirst({ where: { id: rmpId, userId } });
  if (!rmp) return null;
  const status = rmp.status === "paid" ? "submitted" : "paid";
  await prisma.rmp.update({ where: { id: rmp.id }, data: { status } });
  return status;
}

module.exports = {
  RMP_HOURS,
  getDashboardData,
  bundleRmps,
  unbundleRmp,
  togglePaid,
};
