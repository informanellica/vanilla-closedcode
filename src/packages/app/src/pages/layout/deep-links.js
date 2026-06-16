/** @file Parsing and collection helpers for `closedcode://` deep links (open-project and new-session), plus the deep-link event name and the pending-link drain. */

/** Window event name dispatched when new deep links arrive. */
export const deepLinkEvent = "closedcode:deep-link";
/**
 * Parse a string into a URL only if it is a valid `closedcode://` link.
 * @param {string} input - Candidate deep-link string.
 * @returns {URL} The parsed URL, or undefined when not a valid closedcode:// link.
 */
const parseUrl = input => {
  if (!input.startsWith("closedcode://")) return;
  if (typeof URL.canParse === "function" && !URL.canParse(input)) return;
  try {
    return new URL(input);
  } catch {
    return;
  }
};
/**
 * Parse an `open-project` deep link and extract its directory.
 * @param {string} input - Candidate deep-link string.
 * @returns {string} The target directory, or undefined when not an open-project link.
 */
export const parseDeepLink = input => {
  const url = parseUrl(input);
  if (!url) return;
  if (url.hostname !== "open-project") return;
  const directory = url.searchParams.get("directory");
  if (!directory) return;
  return directory;
};
/**
 * Parse a `new-session` deep link into its directory and optional prompt.
 * @param {string} input - Candidate deep-link string.
 * @returns {Object} An object with `directory` and optional `prompt`, or undefined when not a new-session link.
 */
export const parseNewSessionDeepLink = input => {
  const url = parseUrl(input);
  if (!url) return;
  if (url.hostname !== "new-session") return;
  const directory = url.searchParams.get("directory");
  if (!directory) return;
  const prompt = url.searchParams.get("prompt") || undefined;
  if (!prompt) return {
    directory
  };
  return {
    directory,
    prompt
  };
};
/**
 * Collect the valid open-project directories from a list of deep-link strings.
 * @param {Array} urls - Candidate deep-link strings.
 * @returns {Array} The directories from valid open-project links.
 */
export const collectOpenProjectDeepLinks = urls => urls.map(parseDeepLink).filter(directory => !!directory);
/**
 * Collect the valid new-session links from a list of deep-link strings.
 * @param {Array} urls - Candidate deep-link strings.
 * @returns {Array} The { directory, prompt } objects from valid new-session links.
 */
export const collectNewSessionDeepLinks = urls => urls.map(parseNewSessionDeepLink).filter(link => !!link);
/**
 * Drain and clear any deep links queued on the target before the app booted.
 * @param {Object} target - The window-like object holding the pending-link queue.
 * @returns {Array} The pending deep-link strings (empty when none were queued).
 */
export const drainPendingDeepLinks = target => {
  const pending = target.__CLOSEDCODE__?.deepLinks ?? [];
  if (pending.length === 0) return [];
  if (target.__CLOSEDCODE__) target.__CLOSEDCODE__.deepLinks = [];
  return pending;
};