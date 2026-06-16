/** @file Color helpers: validate hex colors, convert hex to RGB, and build ANSI escape sequences for terminal output. */

/**
 * Tests whether a string is a valid 6-digit `#RRGGBB` hex color.
 *
 * @param {string} hex - The candidate color string
 * @returns {boolean} True if `hex` matches the `#RRGGBB` form
 */
export function isValidHex(hex) {
  if (!hex) return false;
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}
/**
 * Converts a `#RRGGBB` hex color into its red/green/blue components.
 *
 * @param {string} hex - A 6-digit hex color string (e.g. "#ff8800")
 * @returns {{r: number, g: number, b: number}} The decoded RGB channel values (0-255)
 */
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
/**
 * Builds an ANSI escape sequence that sets a bold 24-bit foreground color.
 *
 * @param {string} hex - A 6-digit hex color string (e.g. "#ff8800")
 * @returns {string|undefined} The ANSI escape sequence, or undefined when `hex` is invalid
 */
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