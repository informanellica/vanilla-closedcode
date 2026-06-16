/** @file Normalizes auto-generated session titles to a short label. */
const pattern = /^(New session|Child session) - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/**
 * Shorten an auto-generated "New/Child session - <timestamp>" title to just its label.
 * @param {string} title - The raw session title.
 * @returns {string} The label ("New session"/"Child session") for auto titles, otherwise the title unchanged.
 */
export function sessionTitle(title) {
  if (!title) return title;
  const match = title.match(pattern);
  return match?.[1] ?? title;
}