/** @file Helpers for default ("Terminal N") terminal tab titles across the localized title variants. */
const template = "Terminal {{number}}";
const numbered = [template, "محطة طرفية {{number}}", "Терминал {{number}}", "ターミナル {{number}}", "터미널 {{number}}", "เทอร์มินัล {{number}}", "终端 {{number}}", "終端機 {{number}}"];
/**
 * Build the default English terminal title for a tab number.
 * @param {number} number - The 1-based terminal tab number.
 * @returns {string} The default title, e.g. "Terminal 1".
 */
export function defaultTitle(number) {
  return template.replace("{{number}}", String(number));
}
/**
 * Test whether a title is the default title for a given number in any supported locale.
 * @param {string} title - The terminal title to test.
 * @param {number} number - The terminal tab number to match against.
 * @returns {boolean} True if the title is a default "Terminal N"-style title for that number.
 */
export function isDefaultTitle(title, number) {
  return numbered.some(text => title === text.replace("{{number}}", String(number)));
}
/**
 * Find the tab number a default title encodes, scanning numbers up to a maximum.
 * @param {string} title - The terminal title to inspect.
 * @param {number} max - The highest tab number to consider.
 * @returns {number} The matched tab number, or undefined if the title is not a default title.
 */
export function titleNumber(title, max) {
  return Array.from({
    length: max
  }, (_, idx) => idx + 1).find(number => isDefaultTitle(title, number));
}