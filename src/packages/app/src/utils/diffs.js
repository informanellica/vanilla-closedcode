/** @file Runtime validators that normalize diff and message summary shapes. */
/**
 * Type guard for a single diff entry (file/patch/additions/deletions and optional status).
 * @param {*} value - The candidate value to validate.
 * @returns {boolean} True if the value is a well-formed diff entry.
 */
function diff(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!("file" in value) || typeof value.file !== "string") return false;
  if (!("patch" in value) || typeof value.patch !== "string") return false;
  if (!("additions" in value) || typeof value.additions !== "number") return false;
  if (!("deletions" in value) || typeof value.deletions !== "number") return false;
  if (!("status" in value) || value.status === undefined) return true;
  return value.status === "added" || value.status === "deleted" || value.status === "modified";
}
/**
 * Test whether a value is a non-null, non-array plain object.
 * @param {*} value - The candidate value.
 * @returns {boolean} True if the value is a plain object.
 */
function object(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/**
 * Coerce an arbitrary value into an array of valid diff entries, accepting an array,
 * a single diff, or an object whose values are diffs.
 * @param {*} value - The value to normalize into diffs.
 * @returns {Array} An array of valid diff entries (possibly empty).
 */
export function diffs(value) {
  if (Array.isArray(value) && value.every(diff)) return value;
  if (Array.isArray(value)) return value.filter(diff);
  if (diff(value)) return [value];
  if (!object(value)) return [];
  return Object.values(value).filter(diff);
}
/**
 * Normalize a message's summary (title, body and diffs), returning the original
 * object unchanged when no normalization is needed.
 * @param {Object} value - The message to normalize; only user messages with a summary are processed.
 * @returns {Object} The original or a normalized copy of the message.
 */
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