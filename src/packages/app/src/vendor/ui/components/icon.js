/** @file Re-exports the unified Icon component from @/bs/icon.js so vendored components share the app-level implementation. */
// Unified: re-export the single Icon component from @/bs/icon.js.
// All vendored components that `import { Icon } from "./icon.js"` now get
// the same implementation as app-level code.
export { Icon } from "@/bs/icon.js";
