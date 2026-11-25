// Input validation helpers.

/** An error whose message is safe (and useful) to show to the user. */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

const cleanNum = (n) => Math.round(n * 100) / 100;

const isValidUUID = (str) =>
  typeof str === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// YYYY-MM-DD that is a real calendar date. Parsed as UTC so the server's
// timezone can never shift the result.
const isValidDate = (str) => {
  if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const date = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(str);
};

// HH:MM, 24-hour
const isValidTime = (str) => typeof str === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(str);

const isValidNumber = (val, min = -Infinity, max = Infinity) => {
  const num = Number.parseFloat(val);
  return !Number.isNaN(num) && Number.isFinite(num) && num >= min && num <= max;
};

module.exports = {
  ValidationError,
  cleanNum,
  isValidUUID,
  isValidDate,
  isValidTime,
  isValidNumber,
};
