/** @file Locale-aware string, number, time, and duration formatting helpers. */

/**
 * Capitalize the first letter of every word in a string.
 * @param {string} str - The input string.
 * @returns {string} The title-cased string.
 */
export function titlecase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}
/**
 * Format a timestamp as a short, locale-aware time string.
 * @param {string|number|Date} input - A value accepted by the Date constructor.
 * @returns {string} The localized short time (e.g. "3:45 PM").
 */
export function time(input) {
  const date = new Date(input);
  return date.toLocaleTimeString(undefined, {
    timeStyle: "short"
  });
}
/**
 * Format a timestamp as a combined local time and date string.
 * @param {string|number|Date} input - A value accepted by the Date constructor.
 * @returns {string} The localized time and date (e.g. "3:45 PM · 1/1/2025").
 */
export function datetime(input) {
  const date = new Date(input);
  const localTime = time(input);
  const localDate = date.toLocaleDateString();
  return `${localTime} · ${localDate}`;
}
/**
 * Format a timestamp as time only when it falls on the current day, otherwise as a full date and time.
 * @param {string|number|Date} input - A value accepted by the Date constructor.
 * @returns {string} The localized time (if today) or combined time and date (otherwise).
 */
export function todayTimeOrDateTime(input) {
  const date = new Date(input);
  const now = new Date();
  const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (isToday) {
    return time(input);
  } else {
    return datetime(input);
  }
}
/**
 * Format a number with K/M suffixes for thousands and millions.
 * @param {number} num - The number to format.
 * @returns {string} The abbreviated number (e.g. "1.5K", "2.3M") or the plain integer string.
 */
export function number(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}
/**
 * Format a millisecond duration into a human-readable string with the most significant units.
 * @param {number} input - The duration in milliseconds.
 * @returns {string} The formatted duration (e.g. "500ms", "1.5s", "2m 30s", "1h 5m", "2d 3h").
 */
export function duration(input) {
  if (input < 1000) {
    return `${input}ms`;
  }
  if (input < 60000) {
    return `${(input / 1000).toFixed(1)}s`;
  }
  if (input < 3600000) {
    const minutes = Math.floor(input / 60000);
    const seconds = Math.floor(input % 60000 / 1000);
    return `${minutes}m ${seconds}s`;
  }
  if (input < 86400000) {
    const hours = Math.floor(input / 3600000);
    const minutes = Math.floor(input % 3600000 / 60000);
    return `${hours}h ${minutes}m`;
  }
  const hours = Math.floor(input / 3600000);
  const days = Math.floor(input % 3600000 / 86400000);
  return `${days}d ${hours}h`;
}
/**
 * Truncate a string to a maximum length, appending an ellipsis when shortened.
 * @param {string} str - The string to truncate.
 * @param {number} len - The maximum length of the result, including the ellipsis.
 * @returns {string} The original string, or a truncated string ending in an ellipsis.
 */
export function truncate(str, len) {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + "…";
}
/**
 * Truncate a string by removing characters from the middle, keeping both ends.
 * @param {string} str - The string to truncate.
 * @param {number} [maxLength=35] - The maximum length of the result, including the ellipsis.
 * @returns {string} The original string, or a string with its middle replaced by an ellipsis.
 */
export function truncateMiddle(str, maxLength = 35) {
  if (str.length <= maxLength) return str;
  const ellipsis = "…";
  const keepStart = Math.ceil((maxLength - ellipsis.length) / 2);
  const keepEnd = Math.floor((maxLength - ellipsis.length) / 2);
  return str.slice(0, keepStart) + ellipsis + str.slice(-keepEnd);
}
/**
 * Choose the singular or plural template based on a count and substitute the count into it.
 * @param {number} count - The count that determines singular vs. plural and replaces the "{}" placeholder.
 * @param {string} singular - The template used when count is exactly 1.
 * @param {string} plural - The template used for any other count.
 * @returns {string} The selected template with "{}" replaced by the count.
 */
export function pluralize(count, singular, plural) {
  const template = count === 1 ? singular : plural;
  return template.replace("{}", count.toString());
}
export * as Locale from "./locale.js";