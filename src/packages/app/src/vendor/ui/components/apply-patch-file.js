import { normalize } from "./session-diff.js";
function kind(value) {
  if (value === "add" || value === "update" || value === "delete" || value === "move") return value;
}
function status(type) {
  if (type === "add") return "added";
  if (type === "delete") return "deleted";
  return "modified";
}
export function patchFile(raw) {
  if (!raw || typeof raw !== "object") return;
  const value = raw;
  const type = kind(value.type);
  const filePath = typeof value.filePath === "string" ? value.filePath : undefined;
  const relativePath = typeof value.relativePath === "string" ? value.relativePath : filePath;
  const patch = typeof value.patch === "string" ? value.patch : typeof value.diff === "string" ? value.diff : undefined;
  const before = typeof value.before === "string" ? value.before : undefined;
  const after = typeof value.after === "string" ? value.after : undefined;
  if (!type || !filePath || !relativePath) return;
  if (!patch && before === undefined && after === undefined) return;
  const additions = typeof value.additions === "number" ? value.additions : 0;
  const deletions = typeof value.deletions === "number" ? value.deletions : 0;
  const movePath = typeof value.movePath === "string" ? value.movePath : undefined;
  return {
    filePath,
    relativePath,
    type,
    additions,
    deletions,
    movePath,
    view: normalize({
      file: relativePath,
      patch,
      before,
      after,
      additions,
      deletions,
      status: status(type)
    })
  };
}
export function patchFiles(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(patchFile).filter(file => !!file);
}