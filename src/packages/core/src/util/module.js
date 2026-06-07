import { createRequire } from "node:module";
import path from "node:path";
export let Module;
(function (_Module) {
  function resolve(id, dir) {
    try {
      return createRequire(path.join(dir, "package.json")).resolve(id);
    } catch {}
  }
  _Module.resolve = resolve;
})(Module || (Module = {}));