/** @file Live smoke test for the TUI path: drives the TUI's own data layer (createDataLayer + createConnection) against a real closedcode server + a real Ollama provider, headlessly — no terminal, no keystrokes. This exercises the exact code the interactive TUI uses (submit -> promptAsync -> server -> Ollama -> event stream -> store), which the jest suite only covers with the mock LLM. Complements smoke-ollama-cli.mjs. Exits 0 on pass, 1 on fail. */
// Usage:
//   node script/smoke-ollama-tui.mjs                 # serve via the platform SEA under dist/
//   CC_BIN=/path/to/closedcode node script/smoke-ollama-tui.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createConnection } from "../src/cli/cmd/tui/vanilla/data/connection.js";
import { createDataLayer } from "../src/cli/cmd/tui/vanilla/data/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT = "Write a Python function named fib(n) that returns the nth Fibonacci number (iterative). Reply with ONLY one python code block, no prose.";
const directory = process.cwd();

function resolveBin() {
  if (process.env.CC_BIN) return process.env.CC_BIN;
  const dir = path.resolve(__dirname, "..", "dist");
  const cands = process.platform === "win32"
    ? ["closedcode-windows-x64/bin/closedcode.exe"]
    : ["closedcode-linux-x64/bin/closedcode", `closedcode-linux-${process.arch}/bin/closedcode`];
  for (const c of cands) { const p = path.join(dir, c); if (fs.existsSync(p)) return p; }
  throw new Error(`no closedcode binary under ${dir} (build it or set CC_BIN)`);
}

const BIN = resolveBin();
const PORT = 47615;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1) start a real server (hosts the Ollama-configured engine)
const srv = spawn(BIN, ["serve", "--port", String(PORT)], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "", NO_COLOR: "1" } });
let url = null, serr = "";
srv.stdout.on("data", d => { const m = String(d).match(/listening on (http:\/\/\S+)/); if (m) url = m[1]; });
srv.stderr.on("data", d => { serr += String(d); const m = serr.match(/listening on (http:\/\/\S+)/); if (m) url = m[1]; });
for (let i = 0; i < 60 && !url; i++) await sleep(500);
if (!url) { console.error("[smoke-tui] server did not report a URL\n" + serr.slice(-400)); srv.kill(); process.exit(1); }
console.log("[smoke-tui] server:", url, "| bin:", BIN);

let ok = false, asst = "";
try {
  // 2) the TUI's real data layer, pointed at the real server
  const conn = createConnection({ url, directory });
  const data = createDataLayer({ sdk: conn.sdk, ids: conn.ids, directory });
  await data.start();
  await data.bootstrap();
  const providers = data.store.providers() ?? [];
  const ol = providers.find(p => p.id === "ollama") ?? providers[0];
  const modelID = ol && ol.models ? Object.keys(ol.models)[0] : "qwen3-coder-next:q4_K_M";
  const model = { providerID: ol?.id ?? "ollama", modelID };
  console.log("[smoke-tui] model:", model.providerID + "/" + model.modelID);

  // 3) submit through the SAME path the interactive TUI uses
  const sessionID = await data.submit(null, PROMPT, { model });
  console.log("[smoke-tui] session:", sessionID);

  // 4) the streamed assistant reply lands in the store via the event loop
  for (let i = 0; i < 100 && !ok; i++) {
    await sleep(1000);
    // rely on the live event stream (data.start) to fill the store; syncSession's
    // optional todo/diff fetches throw with this sdk build, so don't gate on them.
    const tl = data.store.timeline(sessionID) ?? [];
    asst = tl.filter(m => m.role === "assistant").flatMap(m => m.parts).filter(p => p.type === "text").map(p => p.text).join("\n");
    if (/```[\s\S]*```/.test(asst) || /\bdef\s+\w+\s*\(/.test(asst)) ok = true;
  }
  data.stop();
} catch (e) {
  console.error("[smoke-tui] error:", e?.stack || e?.message || String(e));
} finally {
  srv.kill();
}

console.log("--- assistant reply ---");
console.log((asst || "(empty)").trim().slice(0, 800));
console.log("-----------------------");
console.log(`[smoke-tui] => ${ok ? "PASS ✅" : "FAIL ❌"}`);
process.exit(ok ? 0 : 1);
