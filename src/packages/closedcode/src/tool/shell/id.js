/** @file Shell kind classification and the stable tool ID/permission key for the shell tool. */
const kinds = ["bash", "pwsh", "powershell", "cmd"];
const shellKinds = new Set(kinds);
/**
 * Whether the given value is one of the recognized shell kinds.
 * @param {string} value - Candidate shell kind name.
 * @returns {boolean} True if value is a known shell kind.
 */
function isKind(value) {
  return shellKinds.has(value);
}
/**
 * Normalize an arbitrary shell name to a known kind, falling back to "bash".
 * @param {string} value - Shell name to classify.
 * @returns {string} A recognized shell kind ("bash", "pwsh", "powershell", or "cmd").
 */
export function toKind(value) {
  return isKind(value) ? value : "bash";
}

// Keep the exposed tool ID and permission key as "bash" for compatibility with
// existing plugins, users, and saved permissions. Rename with closedcode 2.0.
/**
 * The stable, externally-visible tool ID and permission key for the shell tool.
 * Kept as "bash" for backwards compatibility with plugins and saved permissions.
 * @type {string}
 */
export const ToolID = "bash";
export * as ShellID from "./id.js";