/** @file Live smoke test: drive the CLI (`closedcode run`) against a real, configured Ollama provider and assert it generates code. Unlike the jest suite (which uses the mock LLM in test/lib/llm-server.js), this exercises the full engine -> provider -> Ollama -> response path end to end. Requires a reachable Ollama configured in the user's closedcode config. Exits 0 on pass, 1 on fail. */
// Usage:
//   node script/smoke-ollama-cli.mjs                 # uses the platform SEA under dist/
//   CC_BIN=/path/to/closedcode node script/smoke-ollama-cli.mjs
//   node script/smoke-ollama-cli.mjs --model ollama/<model>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const model = (() => { const i = argv.indexOf("--model"); return i >= 0 ? argv[i + 1] : process.env.CC_MODEL; })();

/** Resolve the closedcode binary for the host platform (override with CC_BIN). */
function resolveBin() {
  if (process.env.CC_BIN) return process.env.CC_BIN;
  const dir = path.resolve(__dirname, "..", "dist");
  const cands = process.platform === "win32"
    ? ["closedcode-windows-x64/bin/closedcode.exe"]
    : process.platform === "darwin"
      ? [`closedcode-darwin-${process.arch}/bin/closedcode`]
      : ["closedcode-linux-x64/bin/closedcode", `closedcode-linux-${process.arch}/bin/closedcode`];
  for (const c of cands) { const p = path.join(dir, c); if (fs.existsSync(p)) return p; }
  throw new Error(`no closedcode binary under ${dir} (build it or set CC_BIN)`);
}

const BIN = resolveBin();
const PROMPT = "Write a Python function named fib(n) that returns the nth Fibonacci number (iterative). Reply with ONLY one python code block, no prose.";
const args = ["run", ...(model ? ["--model", model] : []), PROMPT];
console.log(`[smoke] bin=${BIN}`);
console.log(`[smoke] running: closedcode ${args.slice(0, model ? 3 : 1).join(" ")} "<prompt>"`);

const r = spawnSync(BIN, args, {
  encoding: "utf8", timeout: 180000, maxBuffer: 16e6,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "", NO_COLOR: "1" },
});
const out = (r.stdout || "") + (r.stderr || "");
// pass criteria: the model returned runnable-looking Python (a fenced block and/or a def)
const hasFence = /```[\s\S]*```/.test(out);
const hasDef = /\bdef\s+fib\s*\(/.test(out) || /\bdef\s+\w+\s*\(/.test(out);
const pass = r.status === 0 && hasDef;

console.log("--- model output ---");
console.log(out.trim().slice(0, 800) || "(empty)");
console.log("--------------------");
console.log(`[smoke] exit=${r.status} fenced=${hasFence} def=${hasDef} => ${pass ? "PASS ✅" : "FAIL ❌"}`);
process.exit(pass ? 0 : 1);
