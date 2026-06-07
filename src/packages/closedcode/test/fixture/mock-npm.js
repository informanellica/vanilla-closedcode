// Test hook for plugin/shared.js's call to `Npm.add`. We can't reliably mock
// the `core/npm` module under Jest's vm-modules loader: tui.js
// transitively links shared.js → npm.js at module-load time, and even when
// `jest.unstable_mockModule` registers a factory, jest's loader does not
// substitute the mocked module for consumers whose bindings were already
// linked (or for self-referencing `export * as Npm` namespace re-exports —
// the override on the namespace object is silently dropped).
//
// Instead, shared.js checks `globalThis.__closedcodeTestNpmAdd` before
// calling the real Npm.add. Setting this hook here gives tests a stable
// injection point that doesn't depend on jest's mock semantics.
import { jest } from "@jest/globals";
export const npmAddMock = jest.fn(async () => {
  throw new Error("Npm.add not mocked");
});
globalThis.__closedcodeTestNpmAdd = (pkg) => npmAddMock(pkg);
export function useNpmAdd() {
  npmAddMock.mockReset();
  return npmAddMock;
}
