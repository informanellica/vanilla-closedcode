/** @file Time formatting helper: renders a localized "time ago" label from a date. */
/**
 * Format a date as a localized relative-time string (just now / minutes / hours / days ago).
 * @param {string} dateString - A date string parseable by the Date constructor.
 * @param {Function} t - Translation function called as t(key, params) returning a localized string.
 * @returns {string} The localized relative-time label.
 */
export function getRelativeTime(dateString, t) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffSeconds < 60) return t("common.time.justNow");
  if (diffMinutes < 60) return t("common.time.minutesAgo.short", {
    count: diffMinutes
  });
  if (diffHours < 24) return t("common.time.hoursAgo.short", {
    count: diffHours
  });
  return t("common.time.daysAgo.short", {
    count: diffDays
  });
}