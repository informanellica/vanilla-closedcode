const kinds = ["bash", "pwsh", "powershell", "cmd"];
const shellKinds = new Set(kinds);
function isKind(value) {
  return shellKinds.has(value);
}
export function toKind(value) {
  return isKind(value) ? value : "bash";
}

// Keep the exposed tool ID and permission key as "bash" for compatibility with
// existing plugins, users, and saved permissions. Rename with closedcode 2.0.
export const ToolID = "bash";
export * as ShellID from "./id.js";