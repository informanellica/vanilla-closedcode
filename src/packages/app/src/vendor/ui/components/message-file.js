export function attached(part) {
  return part.url.startsWith("data:");
}
export function inline(part) {
  if (attached(part)) return false;
  return part.source?.text?.start !== undefined && part.source?.text?.end !== undefined;
}
export function kind(part) {
  return part.mime.startsWith("image/") ? "image" : "file";
}