/** @file Duck-typing guards/adapters for poking at loosely-typed runtime objects (editor instances, terminals, the global object). */

/**
 * Test whether a value is a non-null object (a "record").
 * @param {*} value - Value to test.
 * @returns {boolean} True for any non-null object.
 */
const isRecord = value => {
  return typeof value === "object" && value !== null;
};

/**
 * Test whether a value exposes a `dispose()` method.
 * @param {*} value - Value to test.
 * @returns {boolean} True when `value.dispose` is a function.
 */
export const isDisposable = value => {
  return isRecord(value) && typeof value.dispose === "function";
};
/**
 * Call `dispose()` on a value only if it is disposable; otherwise do nothing.
 * @param {*} value - Value that may carry a `dispose()` method.
 * @returns {void}
 */
export const disposeIfDisposable = value => {
  if (!isDisposable(value)) return;
  value.dispose();
};

/**
 * Test whether a value exposes a `setOption()` method.
 * @param {*} value - Value to test.
 * @returns {boolean} True when `value.setOption` is a function.
 */
export const hasSetOption = value => {
  return isRecord(value) && typeof value.setOption === "function";
};
/**
 * Set an option on a value via its `setOption()` method when supported.
 * @param {*} value - Target object that may support `setOption`.
 * @param {string} key - Option name to set.
 * @param {*} next - New option value.
 * @returns {void}
 */
export const setOptionIfSupported = (value, key, next) => {
  if (!hasSetOption(value)) return;
  value.setOption(key, next);
};

/**
 * Read the text of a value's currently hovered link, if present.
 * @param {*} value - Object that may expose `currentHoveredLink`.
 * @returns {string} The hovered link's text, or undefined when unavailable.
 */
export const getHoveredLinkText = value => {
  if (!isRecord(value)) return;
  const link = value.currentHoveredLink;
  if (!isRecord(link)) return;
  if (typeof link.text !== "string") return;
  return link.text;
};
/**
 * Resolve the SpeechRecognition constructor from a global-like object,
 * preferring the webkit-prefixed variant.
 * @param {*} value - Global-like object (e.g. window) that may expose a SpeechRecognition constructor.
 * @returns {Function} The constructor, or undefined when not available.
 */
export const getSpeechRecognitionCtor = value => {
  if (!isRecord(value)) return;
  const ctor = typeof value.webkitSpeechRecognition === "function" ? value.webkitSpeechRecognition : value.SpeechRecognition;
  if (typeof ctor !== "function") return;
  return ctor;
};