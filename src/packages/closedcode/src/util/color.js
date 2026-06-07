export function isValidHex(hex) {
  if (!hex) return false;
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}
export function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return {
    r,
    g,
    b
  };
}
export function hexToAnsiBold(hex) {
  if (!isValidHex(hex)) return undefined;
  const {
    r,
    g,
    b
  } = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m\x1b[1m`;
}
export * as Color from "./color.js";