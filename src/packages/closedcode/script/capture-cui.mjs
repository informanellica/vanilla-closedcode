/** @file Per-platform capture of the closedcode CLI (CUI). Runs representative commands against each platform's REAL binary — windows=local SEA, linux=the cc-sea-linux Docker image, macOS=a provided darwin binary — captures the colored terminal output (FORCE_COLOR), and renders it to a faithful colored SVG (+ PNG when a sharp build is available) alongside the raw .txt. Mirrors capture-tui.mjs. */
// Usage:
//   node script/capture-cui.mjs [outDir] [--platforms win,linux,mac]
// Runners / overrides (env):
//   CC_BIN_WIN     local windows SEA (default dist/closedcode-windows-x64/bin/closedcode.exe)
//   CC_LINUX_IMAGE docker image holding the linux SEA (default cc-sea-linux:0.1.0)
//   CC_BIN_MAC     darwin SEA path (only used when this host is macOS)
//   CC_SHARP_PATH  a sharp module dir for SVG->PNG rasterization (optional)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { emitImage } from "./lib/png.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const platArg = (argv.find(a => a.startsWith("--platforms=")) || "").split("=")[1]
  || (argv.includes("--platforms") ? argv[argv.indexOf("--platforms") + 1] : "");
const OUT = argv.find(a => !a.startsWith("--") && a !== platArg) || path.resolve(__dirname, "../../../artifacts");

const WIN_BIN = process.env.CC_BIN_WIN || path.resolve(__dirname, "..", "dist", "closedcode-windows-x64", "bin", "closedcode.exe");
const MAC_BIN = process.env.CC_BIN_MAC || "";
const LINUX_IMAGE = process.env.CC_LINUX_IMAGE || "cc-sea-linux:0.1.0";
const LINUX_BIN = "/app/packages/closedcode/dist/closedcode-linux-x64/bin/closedcode";
const RUN_ENV = { FORCE_COLOR: "1", NO_COLOR: "", ELECTRON_RUN_AS_NODE: "" };
// --codegen / CC_CODEGEN=1: capture a real `closedcode run` code-generation instead
// of the help screens (needs a configured, reachable LLM provider). The linux runner
// mounts the host closedcode config so the docker SEA sees the same provider.
const CONFIG_DIR = (process.env.CC_CONFIG_DIR || path.join(os.homedir(), ".config", "closedcode")).replace(/\\/g, "/");
const CODEGEN = process.env.CC_CODEGEN === "1" || process.argv.includes("--codegen");
const CODEGEN_PROMPT = "Write a Python function named fib(n) that returns the nth Fibonacci number (iterative). Reply with ONLY one python code block, no prose.";

/** Run the local windows SEA; returns combined stdout+stderr, or null if unavailable. */
function runWin(args) {
  if (!fs.existsSync(WIN_BIN)) return null;
  const r = spawnSync(WIN_BIN, args, { encoding: "utf8", timeout: 240000, maxBuffer: 16e6, env: { ...process.env, ...RUN_ENV } });
  return r.error ? `(error) ${r.error.message}` : (r.stdout || "") + (r.stderr || "");
}
/** Whether a docker image is present locally. */
function imageExists(img) {
  return spawnSync("docker", ["image", "inspect", img], { encoding: "utf8" }).status === 0;
}
/** Run the linux SEA inside the docker image (spawnSync = no shell, so no MSYS path mangling). */
function runLinux(args) {
  if (spawnSync("docker", ["--version"]).status !== 0 || !imageExists(LINUX_IMAGE)) return null;
  const mount = CODEGEN && fs.existsSync(CONFIG_DIR) ? ["-v", `${CONFIG_DIR}:/root/.config/closedcode:ro`] : [];
  const r = spawnSync("docker", ["run", "--rm", "-e", "FORCE_COLOR=1", "-e", "NO_COLOR=", ...mount, "--entrypoint", LINUX_BIN, LINUX_IMAGE, ...args],
    { encoding: "utf8", timeout: 240000, maxBuffer: 16e6 });
  return r.error ? `(error) ${r.error.message}` : (r.stdout || "") + (r.stderr || "");
}
/** Run a provided darwin SEA (only meaningful on a macOS host). */
function runMac(args) {
  if (process.platform !== "darwin" || !MAC_BIN || !fs.existsSync(MAC_BIN)) return null;
  const r = spawnSync(MAC_BIN, args, { encoding: "utf8", timeout: 90000, maxBuffer: 16e6, env: { ...process.env, ...RUN_ENV } });
  return r.error ? `(error) ${r.error.message}` : (r.stdout || "") + (r.stderr || "");
}

const PLATFORMS = {
  win: { label: "Windows x64", run: runWin },
  linux: { label: "Linux x64 (glibc)", run: runLinux },
  mac: { label: "macOS", run: runMac },
};

// ---- ANSI -> styled cells -> SVG -------------------------------------------
const BASIC = ["#000000", "#cd0000", "#00cd00", "#cdcd00", "#0000ee", "#cd00cd", "#00cdcd", "#e5e5e5",
  "#7f7f7f", "#ff0000", "#00ff00", "#ffff00", "#5c5cff", "#ff00ff", "#00ffff", "#ffffff"];
const DEFAULT_FG = "#d4d4d4";
const hex2 = v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, "0");
/** Map an xterm 256-color index to a hex string. */
function color256(n) {
  if (n < 16) return BASIC[n];
  if (n < 232) { n -= 16; const r = Math.floor(n / 36), g = Math.floor((n % 36) / 6), b = n % 6; const c = v => v === 0 ? 0 : 55 + v * 40; return `#${hex2(c(r))}${hex2(c(g))}${hex2(c(b))}`; }
  const v = 8 + (n - 232) * 10; return `#${hex2(v)}${hex2(v)}${hex2(v)}`;
}
/** Mutate the running SGR state from a `m` parameter string. */
function applySgr(st, params) {
  const codes = params.split(";").map(x => x === "" ? 0 : parseInt(x, 10));
  for (let k = 0; k < codes.length; k++) {
    const n = codes[k];
    if (n === 0) Object.assign(st, { fg: DEFAULT_FG, bold: false, italic: false, underline: false });
    else if (n === 1) st.bold = true; else if (n === 22) st.bold = false;
    else if (n === 3) st.italic = true; else if (n === 23) st.italic = false;
    else if (n === 4) st.underline = true; else if (n === 24) st.underline = false;
    else if (n === 39) st.fg = DEFAULT_FG;
    else if (n >= 30 && n <= 37) st.fg = BASIC[n - 30];
    else if (n >= 90 && n <= 97) st.fg = BASIC[8 + (n - 90)];
    else if (n === 38) {
      if (codes[k + 1] === 5) { st.fg = color256(codes[k + 2] || 0); k += 2; }
      else if (codes[k + 1] === 2) { st.fg = `#${hex2(codes[k + 2])}${hex2(codes[k + 3])}${hex2(codes[k + 4])}`; k += 4; }
    }
  }
}
/** Parse an ANSI stream into lines of styled cells. */
function parseAnsi(text) {
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "");
  const lines = [[]]; const st = { fg: DEFAULT_FG, bold: false, italic: false, underline: false };
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === "\x1b") {
      if (s[i + 1] === "[") { let j = i + 2; while (j < s.length && !/[A-Za-z]/.test(s[j])) j++; if (s[j] === "m") applySgr(st, s.slice(i + 2, j)); i = j + 1; continue; }
      if (s[i + 1] === "]") { let j = i + 2; while (j < s.length && s[j] !== "\x07" && !(s[j] === "\x1b" && s[j + 1] === "\\")) j++; i = s[j] === "\x07" ? j + 1 : j + 2; continue; }
      i++; continue;
    }
    if (c === "\n") { lines.push([]); i++; continue; }
    if (c === "\t") { for (let k = 0; k < 2; k++) lines[lines.length - 1].push({ ch: " ", ...st }); i++; continue; }
    lines[lines.length - 1].push({ ch: c, ...st }); i++;
  }
  return lines;
}
const xml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const same = (a, b) => a.fg === b.fg && a.bold === b.bold && a.italic === b.italic && a.underline === b.underline;
/** Render styled lines into a colored monospace SVG document. */
function linesToSvg(lines, title) {
  const cols = Math.min(130, Math.max(50, title.length + 4, ...lines.map(l => l.length)));
  const rows = lines.length;
  const CW = 8.0, CH = 17, FS = 13, PAD = 12, TITLE_H = 26;
  const wpx = Math.round(cols * CW + PAD * 2), hpx = Math.round(rows * CH + PAD * 2 + TITLE_H);
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wpx}" height="${hpx}" font-family="'Cascadia Mono','DejaVu Sans Mono',Consolas,monospace" font-size="${FS}px">`,
    `<rect width="${wpx}" height="${hpx}" fill="#181818"/>`,
    `<rect width="${wpx}" height="${TITLE_H}" fill="#2a2a2a"/>`,
    `<text x="${PAD}" y="17" fill="#9aa0a6" font-size="12px">$ ${xml(title)}</text>`,
  ];
  const oy = TITLE_H + PAD;
  lines.forEach((line, y) => {
    let x = 0;
    while (x < line.length) {
      const st = line[x]; let run = ""; const sx = x;
      while (x < line.length && same(line[x], st)) { run += line[x].ch; x++; }
      if (run.trim() !== "") {
        const a = `fill="${st.fg}"${st.bold ? ' font-weight="bold"' : ""}${st.italic ? ' font-style="italic"' : ""}${st.underline ? ' text-decoration="underline"' : ""}`;
        out.push(`<text x="${(PAD + sx * CW).toFixed(1)}" y="${(oy + y * CH + 12).toFixed(1)}" ${a} xml:space="preserve">${xml(run)}</text>`);
      }
    }
  });
  out.push("</svg>");
  return out.join("\n");
}

// ---- scenarios + drive ------------------------------------------------------
const scenarios = CODEGEN
  ? [{ name: "codegen", title: 'closedcode run "write a fib(n) function"', args: ["run", CODEGEN_PROMPT] }]
  : [
      { name: "01-version", title: "closedcode --version", args: ["--version"] },
      { name: "02-help", title: "closedcode --help", args: ["--help"] },
      { name: "03-run-help", title: "closedcode run --help", args: ["run", "--help"] },
      { name: "04-serve-help", title: "closedcode serve --help", args: ["serve", "--help"] },
      { name: "05-models-help", title: "closedcode models --help", args: ["models", "--help"] },
    ];

const keepSvg = process.argv.includes("--keep-svg"); // PNG by default; --keep-svg also writes SVG
const wanted = (platArg ? platArg.split(",") : Object.keys(PLATFORMS)).map(p => p.trim()).filter(p => PLATFORMS[p]);
fs.mkdirSync(OUT, { recursive: true });
const made = []; const skipped = [];
for (const plat of wanted) {
  const { label, run } = PLATFORMS[plat];
  const probe = run(["--version"]);
  if (probe === null) { skipped.push(`${plat} (${label}): runner unavailable`); continue; }
  for (const sc of scenarios) {
    const raw = run(sc.args) || "(no output)";
    const base = `vanilla-cui-${plat}-${sc.name}`;
    fs.writeFileSync(path.join(OUT, base + ".txt"), raw.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\s+$/, "") + "\n");
    const svg = linesToSvg(parseAnsi(raw), `[${label}] ${sc.title}`);
    made.push(...await emitImage(path.join(OUT, base), svg, { keepSvg }));
  }
}
console.log("CUI captures ->", OUT);
console.log("made:", made.length, "files;", made.filter(f => f.endsWith(".png")).length, "png");
if (skipped.length) console.log("skipped:\n  " + skipped.join("\n  "));
