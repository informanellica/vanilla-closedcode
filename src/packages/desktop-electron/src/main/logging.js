/** @file Main-process logging setup over electron-log: size cap, old-log cleanup, and a log-tail helper. */
import log from "electron-log/main.js";
import { readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
const MAX_LOG_AGE_DAYS = 7;
const TAIL_LINES = 1000;
/**
 * Configure the file transport (max size), prune stale log files, and return the logger.
 * @returns {Object} The configured electron-log instance.
 */
export function initLogging() {
  log.transports.file.maxSize = 5 * 1024 * 1024;
  cleanup();
  return log;
}
/**
 * Read the most recent lines from the active log file.
 * @returns {string} Up to TAIL_LINES trailing lines, or an empty string on error.
 */
export function tail() {
  try {
    const path = log.transports.file.getFile().path;
    const contents = readFileSync(path, "utf8");
    const lines = contents.split("\n");
    return lines.slice(Math.max(0, lines.length - TAIL_LINES)).join("\n");
  } catch {
    return "";
  }
}
/**
 * Delete log files in the log directory older than MAX_LOG_AGE_DAYS.
 * @returns {void}
 */
function cleanup() {
  const path = log.transports.file.getFile().path;
  const dir = dirname(path);
  const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry);
    try {
      const info = statSync(file);
      if (!info.isFile()) continue;
      if (info.mtimeMs < cutoff) unlinkSync(file);
    } catch {
      continue;
    }
  }
}