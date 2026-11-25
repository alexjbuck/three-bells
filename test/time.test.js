const { test } = require("node:test");
const assert = require("node:assert/strict");
const t = require("../lib/time");
const { ValidationError, isValidDate } = require("../lib/validation");

test("range entries are stored as UTC wall-clock times", () => {
  const r = t.parseLogInput({
    workDate: "2026-11-24",
    mode: "range",
    startTime: "18:00",
    endTime: "20:30",
  });
  assert.equal(r.hours, 2.5);
  assert.equal(r.start.toISOString(), "2026-11-24T18:00:00.000Z");
  assert.equal(r.end.toISOString(), "2026-11-24T20:30:00.000Z");
  assert.equal(r.note, null);
});

test("an end time before the start runs past midnight", () => {
  const r = t.parseLogInput({
    workDate: "2026-11-24",
    mode: "range",
    startTime: "23:00",
    endTime: "01:15",
  });
  assert.equal(r.hours, 2.25);
  assert.equal(r.end.toISOString(), "2026-11-25T01:15:00.000Z");
});

test("manual entries use noon with start === end", () => {
  const r = t.parseLogInput({ workDate: "2026-11-24", mode: "manual", manualHours: "1.5" });
  assert.equal(r.hours, 1.5);
  assert.equal(r.start.toISOString(), "2026-11-24T12:00:00.000Z");
  assert.ok(t.isManual(r));
});

test("mode decides which inputs are used", () => {
  const r = t.parseLogInput({
    workDate: "2026-11-24",
    mode: "range",
    startTime: "09:00",
    endTime: "10:00",
    manualHours: "5",
  });
  assert.equal(r.hours, 1);
});

test("legacy bodies without mode: manual hours win", () => {
  const r = t.parseLogInput({
    workDate: "2026-11-24",
    startTime: "09:00",
    endTime: "10:00",
    manualHours: "5",
  });
  assert.equal(r.hours, 5);
});

test("notes are trimmed and capped", () => {
  const r = t.parseLogInput({
    workDate: "2026-11-24",
    mode: "manual",
    manualHours: "1",
    note: `  ${"x".repeat(600)}  `,
  });
  assert.equal(r.note.length, t.MAX_NOTE_LENGTH);
});

test("invalid input throws user-facing ValidationErrors", () => {
  const cases = [
    { workDate: "2026-02-30", mode: "manual", manualHours: "1" },
    { workDate: "2026-11-24", mode: "manual", manualHours: "" },
    { workDate: "2026-11-24", mode: "manual", manualHours: "0" },
    { workDate: "2026-11-24", mode: "manual", manualHours: "25" },
    { workDate: "2026-11-24", mode: "range", startTime: "09:00" },
    { workDate: "2026-11-24", mode: "range", startTime: "9am", endTime: "10:00" },
    { workDate: "2026-11-24", mode: "range", startTime: "10:00", endTime: "10:00" },
  ];
  for (const body of cases) {
    assert.throws(() => t.parseLogInput(body), ValidationError, JSON.stringify(body));
  }
});

test("logToFormValues round-trips through parseLogInput", () => {
  const original = t.parseLogInput({
    workDate: "2026-11-24",
    mode: "range",
    startTime: "18:15",
    endTime: "20:00",
    note: "hi",
  });
  const again = t.parseLogInput(t.logToFormValues(original));
  assert.deepEqual(again, original);

  const manual = t.parseLogInput({ workDate: "2026-11-24", mode: "manual", manualHours: "2" });
  assert.deepEqual(t.parseLogInput(t.logToFormValues(manual)), manual);
});

test("formatting ignores the server timezone", () => {
  const d = new Date("2026-11-24T23:30:00Z");
  assert.equal(t.formatShortDate(d), "11/24/2026");
  assert.equal(t.formatTime(d), "11:30 PM");
  assert.equal(t.formatWeekday(d), "Tue");
  assert.equal(t.formatMonth(d), "November 2026");
  assert.equal(t.monthKey(d), "2026-11");
  assert.equal(t.formatHours(1.75), "1.75");
  assert.equal(t.formatHours(2), "2");
});

test("isValidDate", () => {
  assert.ok(isValidDate("2024-02-29"));
  assert.ok(!isValidDate("2023-02-29"));
  assert.ok(!isValidDate("2026-13-01"));
  assert.ok(!isValidDate("11/24/2026"));
  assert.ok(!isValidDate(undefined));
});
