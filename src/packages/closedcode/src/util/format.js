/** @file Human-readable formatting helpers (durations, etc.). */

/**
 * Format a duration in seconds as a compact human-readable string.
 *
 * Produces units that scale with magnitude: seconds (`s`), minutes/seconds
 * (`m`/`s`), hours/minutes (`h`/`m`), approximate days (`~N days`), and
 * approximate weeks (`~N weeks`). Non-positive durations yield an empty string.
 *
 * @param {number} secs - The duration in seconds.
 * @returns {string} The formatted duration, or an empty string when `secs <= 0`.
 */
export function formatDuration(secs) {
  if (secs <= 0) return "";
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return remaining > 0 ? `${mins}m ${remaining}s` : `${mins}m`;
  }
  if (secs < 86400) {
    const hours = Math.floor(secs / 3600);
    const remaining = Math.floor(secs % 3600 / 60);
    return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
  }
  if (secs < 604800) {
    const days = Math.floor(secs / 86400);
    return days === 1 ? "~1 day" : `~${days} days`;
  }
  const weeks = Math.floor(secs / 604800);
  return weeks === 1 ? "~1 week" : `~${weeks} weeks`;
}