// Test setup file (sync, runs before test modules import). Used to install
// runtime polyfills that downstream test imports rely on at module-load time.
//
// node:ffi polyfill — @opentui/core (loaded transitively from TUI plugin
// runtime imports) expects a Bun-style `node:ffi` API on globalThis at
// module-load time; install it eagerly so any subsequent import resolves
// against the polyfill instead of crashing on missing `bun:ffi`.
import "../src/util/node-ffi-polyfill.js";

