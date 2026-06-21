/** @file Capture the vanilla TUI displaying REAL LLM-generated code. Drives the TUI's own data layer against a real closedcode server + Ollama to obtain a genuine code reply (no terminal), then renders the TUI shell off-screen showing that reply, emitting an SVG (+ PNG when sharp is available). Combines smoke-ollama-tui.mjs (real reply) with capture-tui.mjs (off-screen render). */
// Usage:
//   node script/capture-tui-codegen.mjs [outDir]
//   CC_BIN=/path/to/closedcode CC_LABEL="Linux x64 (glibc)" CC_TAG=linux node script/capture-tui-codegen.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import tk from "terminal-kit";
import { emitImage } from "./lib/png.mjs";
import { makeRegion } from "../src/cli/cmd/tui/runtime/layout.js";
import { width as dispWidth } from "../src/cli/cmd/tui/runtime/text.js";
import { createShell } from "../src/cli/cmd/tui/vanilla/shell.js";
import { defaultTheme } from "../src/cli/cmd/tui/vanilla/theme.js";
import { createConnection } from "../src/cli/cmd/tui/vanilla/data/connection.js";
import { createDataLayer } from "../src/cli/cmd/tui/vanilla/data/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || path.resolve(__dirname, "../../../artifacts");
const LABEL = process.env.CC_LABEL || (process.platform === "win32" ? "Windows x64" : "Linux x64 (glibc)");
const TAG = process.env.CC_TAG || (process.platform === "win32" ? "win" : "linux");
const PROMPT = "Write a Python function named fib(n) that returns the nth Fibonacci number (iterative). Reply with ONLY one python code block, no prose.";
const directory = process.cwd();
const W = 96, H = 34;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function resolveBin() {
  if (process.env.CC_BIN) return process.env.CC_BIN;
  const dir = path.resolve(__dirname, "..", "dist");
  const cands = process.platform === "win32"
    ? ["closedcode-windows-x64/bin/closedcode.exe"]
    : ["closedcode-linux-x64/bin/closedcode", `closedcode-linux-${process.arch}/bin/closedcode`];
  for (const c of cands) { const p = path.join(dir, c); if (fs.existsSync(p)) return p; }
  throw new Error(`no closedcode binary under ${dir} (set CC_BIN)`);
}

// ---- off-screen render -> SVG (mirrors capture-tui.mjs) --------------------
const xml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rgb = c => (c ? `rgb(${c.r},${c.g},${c.b})` : "none");
const hexR = h => parseInt(h.slice(1, 3), 16), hexG = h => parseInt(h.slice(3, 5), 16), hexB = h => parseInt(h.slice(5, 7), 16);
function bufferToSvg(buf, w, h, title) {
  const CW = 8.6, CH = 18, FS = 14, PAD = 10, TITLE_H = 26;
  const wpx = Math.round(w * CW + PAD * 2), hpx = Math.round(h * CH + PAD * 2 + TITLE_H);
  const base = defaultTheme.background;
  const rects = [`<rect width="${wpx}" height="${hpx}" fill="${base}"/>`, `<rect width="${wpx}" height="${TITLE_H}" fill="${defaultTheme.backgroundElement}"/>`];
  const texts = [`<text x="${PAD}" y="17" fill="${defaultTheme.textMuted}" font-size="12px">${xml(title)}</text>`];
  const oy = TITLE_H + PAD;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cell = buf.get({ x, y });
    const ch = cell.char;
    if (ch == null || ch === "") continue;
    let fg = cell.attr.color, bg = cell.attr.bgColor;
    if (cell.attr.inverse) { const t = fg; fg = bg; bg = t; }
    const cw = Math.max(1, dispWidth(ch));
    const px = +(PAD + x * CW).toFixed(2), py = +(oy + y * CH).toFixed(2);
    const bgHex = rgb(bg);
    if (bgHex !== "none" && (bg.r !== hexR(base) || bg.g !== hexG(base) || bg.b !== hexB(base) || cell.attr.inverse))
      rects.push(`<rect x="${px}" y="${py}" width="${(CW * cw).toFixed(2)}" height="${CH}" fill="${bgHex}"/>`);
    if (ch !== " ") {
      const w2 = cell.attr.bold ? ' font-weight="bold"' : "", i2 = cell.attr.italic ? ' font-style="italic"' : "", u2 = cell.attr.underline ? ' text-decoration="underline"' : "";
      texts.push(`<text x="${px}" y="${(py + 13).toFixed(2)}" fill="${rgb(fg)}"${w2}${i2}${u2}>${xml(ch)}</text>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${wpx}" height="${hpx}" font-family="'DejaVu Sans Mono','Cascadia Mono',Menlo,Consolas,monospace" font-size="${FS}px">\n${rects.join("\n")}\n${texts.join("\n")}\n</svg>\n`;
}

// ---- 1) obtain a real code reply through the TUI data layer ----------------
const BIN = resolveBin();
const srv = spawn(BIN, ["serve", "--port", "47616"], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "", NO_COLOR: "1" } });
let url = null, serr = "";
srv.stdout.on("data", d => { const m = String(d).match(/listening on (http:\/\/\S+)/); if (m) url = m[1]; });
srv.stderr.on("data", d => { serr += String(d); const m = serr.match(/listening on (http:\/\/\S+)/); if (m) url = m[1]; });
for (let i = 0; i < 60 && !url; i++) await sleep(500);
if (!url) { console.error("server did not start\n" + serr.slice(-300)); srv.kill(); process.exit(1); }

let reply = "";
try {
  const conn = createConnection({ url, directory });
  const data = createDataLayer({ sdk: conn.sdk, ids: conn.ids, directory });
  await data.start();
  await data.bootstrap();
  const providers = data.store.providers() ?? [];
  const ol = providers.find(p => p.id === "ollama") ?? providers[0];
  const model = { providerID: ol?.id ?? "ollama", modelID: ol && ol.models ? Object.keys(ol.models)[0] : "qwen3-coder-next:q4_K_M" };
  const sessionID = await data.submit(null, PROMPT, { model });
  // poll until the streamed reply contains code AND has settled (stopped growing),
  // so we render the COMPLETE code block, not a mid-stream fragment.
  let prev = "", stable = 0;
  for (let i = 0; i < 150; i++) {
    await sleep(1000);
    const tl = data.store.timeline(sessionID) ?? [];
    reply = tl.filter(m => m.role === "assistant").flatMap(m => m.parts).filter(p => p.type === "text").map(p => p.text).join("\n");
    stable = reply && reply === prev ? stable + 1 : 0;
    prev = reply;
    if (reply.length > 40 && /\bdef\s+\w+\s*\(/.test(reply) && stable >= 3) break;
  }
  data.stop();
} finally {
  srv.kill();
}
if (!/```|\bdef\s+\w+\s*\(/.test(reply)) { console.error("no code reply captured"); process.exit(1); }

// ---- 2) render the TUI shell showing that real reply -----------------------
const shell = createShell();
shell.navigate({ type: "session", sessionID: "codegen" });
shell.pushMessage({ role: "user", parts: [{ type: "text", text: PROMPT }] });
shell.pushMessage({ role: "assistant", parts: [{ type: "text", text: reply }] });
const buf = new tk.ScreenBufferHD({ width: W, height: H });
buf.fill({ char: " ", attr: { color: defaultTheme.text, bgColor: defaultTheme.background } });
shell.draw(makeRegion(buf, 0, 0, W, H), { focusCursor: () => {} });

fs.mkdirSync(OUT, { recursive: true });
const base = `tui-codegen-${TAG}`;
const svg = bufferToSvg(buf, W, H, `[${LABEL}] TUI showing a live ollama code reply`);
fs.writeFileSync(path.join(OUT, base + ".reply.txt"), reply.trim() + "\n");
const made = await emitImage(path.join(OUT, base), svg, { keepSvg: process.argv.includes("--keep-svg") });
console.log(`tui-codegen [${LABEL}] -> ${made.join(", ")}  (reply has code: ${/def\s+\w+\s*\(/.test(reply)})`);
