// Stub for the `bun` runtime module in Node builds.
//
// Some bundled dependencies do `import { plugin } from "bun"` to register a Bun
// loader/macro at module-evaluation time. Under Node there is no `bun` package,
// which made `node closedcode.js` fail with ERR_MODULE_NOT_FOUND. esbuild has
// already applied the relevant transforms at bundle time, so the Bun-side
// registration is a no-op for Node builds — provide inert exports so the bundle
// loads on Node without requiring Bun.
export const plugin = () => {};

// Defensive catch-all so any other named/default import from "bun" resolves to
// an inert value instead of crashing the bundle at load.
const inert = new Proxy(function () {}, {
  get: () => inert,
  apply: () => undefined,
  construct: () => ({}),
});
export default inert;
