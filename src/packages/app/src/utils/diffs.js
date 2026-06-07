function diff(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!("file" in value) || typeof value.file !== "string") return false;
  if (!("patch" in value) || typeof value.patch !== "string") return false;
  if (!("additions" in value) || typeof value.additions !== "number") return false;
  if (!("deletions" in value) || typeof value.deletions !== "number") return false;
  if (!("status" in value) || value.status === undefined) return true;
  return value.status === "added" || value.status === "deleted" || value.status === "modified";
}
function object(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function diffs(value) {
  if (Array.isArray(value) && value.every(diff)) return value;
  if (Array.isArray(value)) return value.filter(diff);
  if (diff(value)) return [value];
  if (!object(value)) return [];
  return Object.values(value).filter(diff);
}
export function message(value) {
  if (value.role !== "user") return value;
  const raw = value.summary;
  if (raw === undefined) return value;
  if (!object(raw)) return {
    ...value,
    summary: undefined
  };
  const title = typeof raw.title === "string" ? raw.title : undefined;
  const body = typeof raw.body === "string" ? raw.body : undefined;
  const next = diffs(raw.diffs);
  if (title === raw.title && body === raw.body && next === raw.diffs) return value;
  return {
    ...value,
    summary: {
      ...(title === undefined ? {} : {
        title
      }),
      ...(body === undefined ? {} : {
        body
      }),
      diffs: next
    }
  };
}