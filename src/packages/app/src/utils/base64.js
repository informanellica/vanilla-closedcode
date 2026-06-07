import { base64Decode } from "core/util/encode";
export function decode64(value) {
  if (value === undefined) return;
  try {
    return base64Decode(value);
  } catch {
    return;
  }
}