// Jest stub for @opentui/solid/runtime-plugin-support[/configure]. The upstream
// package ships `.ts` files for these subpaths, which Jest cannot load. In the
// Node-only build of @opentui/solid these helpers are no-ops (see upstream
// runtime-plugin-support-configure.ts: `return false`), so the stub matches.
export function ensureRuntimePluginSupport() {
  return false;
}
