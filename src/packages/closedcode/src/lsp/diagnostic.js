/** @file Formats LSP diagnostics into human-readable, model-friendly text reports. */
/** Maximum number of error diagnostics included per file in a report before truncating. */
const MAX_PER_FILE = 20;
/**
 * Format a single LSP diagnostic as a one-line string.
 * @param {Object} diagnostic - LSP diagnostic with severity, range, and message.
 * @returns {string} A line like "ERROR [12:5] message".
 */
export function pretty(diagnostic) {
  const severityMap = {
    1: "ERROR",
    2: "WARN",
    3: "INFO",
    4: "HINT"
  };
  const severity = severityMap[diagnostic.severity || 1];
  const line = diagnostic.range.start.line + 1;
  const col = diagnostic.range.start.character + 1;
  return `${severity} [${line}:${col}] ${diagnostic.message}`;
}
/**
 * Build an XML-tagged report of error-severity diagnostics for a file, truncated to MAX_PER_FILE.
 * @param {string} file - The file path the diagnostics belong to.
 * @param {Array} issues - All diagnostics for the file; only severity-1 (error) items are included.
 * @returns {string} A <diagnostics> block, or "" when there are no errors.
 */
export function report(file, issues) {
  const errors = issues.filter(item => item.severity === 1);
  if (errors.length === 0) return "";
  const limited = errors.slice(0, MAX_PER_FILE);
  const more = errors.length - MAX_PER_FILE;
  const suffix = more > 0 ? `\n... and ${more} more` : "";
  return `<diagnostics file="${file}">\n${limited.map(pretty).join("\n")}${suffix}\n</diagnostics>`;
}
export * as Diagnostic from "./diagnostic.js";