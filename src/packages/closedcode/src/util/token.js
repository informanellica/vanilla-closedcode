const CHARS_PER_TOKEN = 4;
export function estimate(input) {
  return Math.max(0, Math.round((input || "").length / CHARS_PER_TOKEN));
}
export * as Token from "./token.js";