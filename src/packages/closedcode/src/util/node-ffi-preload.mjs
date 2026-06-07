// Pre-loaded via `node --import` so the polyfill is on globalThis before
// any @opentui/core top-level `await import("node:ffi")` fires.
import * as polyfill from "./node-ffi-polyfill.js"

const ffi = polyfill.default ?? polyfill
;(globalThis).__closedcodeNodeFfi ??= ffi
