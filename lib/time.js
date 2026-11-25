// Time handling.
//
// Log times are "wall-clock" times: what the user typed (e.g. 18:00 on
// 2026-11-24), stored in the database as that same wall-clock value in UTC.
// Parsing and formatting therefore always use UTC so the result never depends
// on the server's timezone (Vercel runs in UTC, a laptop usually does not).
// The browser is responsible for anything that needs the user's local time,
// such as "today" or the live timer.

const {
  ValidationError,
  cleanNum,
  isValidDate,
  isValidTime,
  isValidNumber,
} = require("./validation");

const MANUAL_HOUR = "12:00";
const MAX_NOTE_LENGTH = 500;

/** Build a Date for a wall-clock date + time (stored as UTC). */
const wallClock = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00Z`);

/** Manual entries are stored with start === end. */
const isManual = (log) => log.start.getTime() === log.end.getTime();

/**
 * Validate a log entry form body and convert it to { hours, start, end, note }.
 * `mode` is "range" or "manual"; when absent we fall back to the legacy
 * behaviour where a manual hours value wins.
 */
function parseLogInput(body) {
  const { workDate, startTime, endTime, manualHours, note } = body;
  let mode = body.mode;
  if (mode !== "range" && mode !== "manual") {
    mode = manualHours ? "manual" : "range";
  }

  if (!isValidDate(workDate)) {
    throw new ValidationError("Enter a valid work date.");
  }

  const processedNote =
    typeof note === "string" ? note.trim().slice(0, MAX_NOTE_LENGTH) || null : null;

  if (mode === "manual") {
    if (manualHours === undefined || manualHours === "") {
      throw new ValidationError("Enter the number of hours.");
    }
    if (!isValidNumber(manualHours, 0, 24) || Number.parseFloat(manualHours) <= 0) {
      throw new ValidationError("Hours must be more than 0 and no more than 24.");
    }
    const d = wallClock(workDate, MANUAL_HOUR);
    return {
      hours: cleanNum(Number.parseFloat(manualHours)),
      start: d,
      end: d,
      note: processedNote,
    };
  }

  if (!startTime || !endTime) {
    throw new ValidationError("Enter both a start and an end time.");
  }
  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    throw new ValidationError("Times must be in HH:MM format.");
  }
  if (startTime === endTime) {
    throw new ValidationError("Start and end times can't be the same.");
  }

  const start = wallClock(workDate, startTime);
  const end = wallClock(workDate, endTime);
  // An end time earlier than the start means the session ran past midnight.
  if (end < start) end.setUTCDate(end.getUTCDate() + 1);

  const hours = cleanNum((end - start) / 3600000);
  return { hours, start, end, note: processedNote };
}

/** Form values (strings) for editing an existing log. */
function logToFormValues(log) {
  const manual = isManual(log);
  return {
    workDate: toDateInput(log.start),
    mode: manual ? "manual" : "range",
    startTime: manual ? "" : toTimeInput(log.start),
    endTime: manual ? "" : toTimeInput(log.end),
    manualHours: manual ? String(log.hours) : "",
    note: log.note || "",
  };
}

// ---- Formatting (always UTC, see top of file) ----

const formatter = (opts) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts });
const fShort = formatter({ month: "numeric", day: "numeric", year: "numeric" });
const fMedium = formatter({ month: "short", day: "numeric", year: "numeric" });
const fMonthDay = formatter({ month: "short", day: "numeric" });
const fWeekday = formatter({ weekday: "short" });
const fTime = formatter({ hour: "numeric", minute: "2-digit" });
const fMonth = formatter({ month: "long", year: "numeric" });

const toDateInput = (d) => d.toISOString().slice(0, 10);
const toTimeInput = (d) => d.toISOString().slice(11, 16);
const monthKey = (d) => d.toISOString().slice(0, 7);

const formatHours = (n) => String(cleanNum(n));

module.exports = {
  wallClock,
  isManual,
  parseLogInput,
  logToFormValues,
  toDateInput,
  toTimeInput,
  monthKey,
  formatHours,
  formatShortDate: (d) => fShort.format(d),
  formatMediumDate: (d) => fMedium.format(d),
  formatMonthDay: (d) => fMonthDay.format(d),
  formatWeekday: (d) => fWeekday.format(d),
  formatTime: (d) => fTime.format(d),
  formatMonth: (d) => fMonth.format(d),
  MAX_NOTE_LENGTH,
};
