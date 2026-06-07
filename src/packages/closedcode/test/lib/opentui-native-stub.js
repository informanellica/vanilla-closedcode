// Jest-only stub for @opentui/core-${platform}-${arch}. The upstream package
// ships an ESM index.js but does NOT declare {"type":"module"} in its
// package.json, so Jest's CJS loader rejects the `import` syntax. This stub
// returns the path to the bundled dylib the same way the real index.js does,
// from whichever platform-arch package is installed.
import { createRequire } from "node:module";
import path from "node:path";
const require_ = createRequire(import.meta.url);
const platformPkg = `@opentui/core-${process.platform}-${process.arch}`;
const pkgJsonPath = require_.resolve(`${platformPkg}/package.json`);
const dylibName = process.platform === "win32"
  ? "opentui.dll"
  : process.platform === "darwin"
    ? "libopentui.dylib"
    : "libopentui.so";
export default path.join(path.dirname(pkgJsonPath), dylibName);
