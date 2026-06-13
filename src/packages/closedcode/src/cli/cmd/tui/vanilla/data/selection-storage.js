// File-backed storage adapter for the vanilla selection (model/agent/variant
// overrides + favorites). Persists to <dir>/tui-selection.json so a chosen
// model/agent/variant and the favorites list survive across runs — the from-
// scratch equivalent of the original local.js model.json. The synchronous
// load()/save() shape matches the createSelection({ storage }) contract; every
// IO failure degrades to in-memory (load -> null, save -> ignored) so the TUI
// never crashes on a missing/read-only config dir or malformed file.
//
// `dir` is INJECTED (main.js passes the app config dir, Global.Path.config) so
// this module imports no `core/*` workspace alias and stays runnable/testable
// under a bare `node` process. A home-relative `.closedcode` is the safety-net
// default if no dir is supplied.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function defaultDir() {
  const home = os.homedir?.() || process.env.HOME || process.env.USERPROFILE || ".";
  return path.join(home, ".closedcode");
}

export function createSelectionStorage(opts = {}) {
  const dir = opts.dir || defaultDir();
  const file = path.join(dir, opts.name ?? "tui-selection.json");
  return {
    load() {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        // The snapshot is always a plain object {agent,model,favorites,variants};
        // arrays / primitives are "nothing saved" (typeof [] === "object").
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null; // missing file / bad JSON / unreadable -> nothing saved
      }
    },
    save(snapshot) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
      } catch {
        /* read-only FS / permission error -> selection stays in memory */
      }
    },
  };
}
