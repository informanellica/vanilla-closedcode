// Copyright 2019-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

/** @file Renderer module that wires Ctrl/Cmd +/-/0 keyboard shortcuts to adjust and reset the webview zoom factor, exposing the current zoom as a reactive signal. */
import { createSignal } from "../../../app/src/lib/reactivity.js";
/**
 * Detected operating system family derived from the user agent string.
 * One of "macos", "windows", "linux", or "unknown"; used to choose the zoom modifier key (Cmd on macOS, Ctrl elsewhere).
 * @type {string}
 */
const OS_NAME = (() => {
  if (navigator.userAgent.includes("Mac")) return "macos";
  if (navigator.userAgent.includes("Windows")) return "windows";
  if (navigator.userAgent.includes("Linux")) return "linux";
  return "unknown";
})();
/**
 * Reactive signal holding the current webview zoom factor (1 = 100%), with its setter.
 * @type {Array}
 */
const [webviewZoom, setWebviewZoom] = createSignal(1);
/**
 * Upper bound for the zoom factor (1000%).
 * @type {number}
 */
const MAX_ZOOM_LEVEL = 10;
/**
 * Lower bound for the zoom factor (20%).
 * @type {number}
 */
const MIN_ZOOM_LEVEL = 0.2;
/**
 * Constrains a zoom factor to the allowed [MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL] range.
 * @param {number} value - Proposed zoom factor.
 * @returns {number} The value clamped to the supported zoom range.
 */
const clamp = value => Math.min(Math.max(value, MIN_ZOOM_LEVEL), MAX_ZOOM_LEVEL);
/**
 * Updates the reactive zoom signal and pushes the new factor to the main process over the IPC bridge.
 * @param {number} next - Zoom factor to apply.
 * @returns {void}
 */
const applyZoom = next => {
  setWebviewZoom(next);
  void window.api.setZoomFactor(next);
};
window.addEventListener("keydown", event => {
  if (!(OS_NAME === "macos" ? event.metaKey : event.ctrlKey)) return;
  if (event.key === "-") {
    event.preventDefault();
    applyZoom(clamp(webviewZoom() - 0.2));
    return;
  }
  if (event.key === "=" || event.key === "+") {
    event.preventDefault();
    applyZoom(clamp(webviewZoom() + 0.2));
    return;
  }
  if (event.key === "0") {
    event.preventDefault();
    applyZoom(1);
  }
});
export { webviewZoom };