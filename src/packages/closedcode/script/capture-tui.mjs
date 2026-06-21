/** @file Renders representative vanilla-TUI screens off-screen and emits SVG (and optional PNG) screenshots of each scenario. */
// Render representative vanilla-TUI screens into a detached ScreenBufferHD (no
// TTY) and emit faithful SVG "screenshots" — each rendered cell's 24-bit fg/bg
// colors + bold/italic/underline/inverse are read back via buf.get() and drawn as
// a monospace grid. Optionally rasterizes to PNG when `sharp` is available.
//
//   node script/capture-tui.mjs [outDir]
// Default outDir: ../../../artifacts/closedcode-self-improvement/tui-captures
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tk from "terminal-kit";
import { emitImage } from "./lib/png.mjs";
import { makeRegion } from "../src/cli/cmd/tui/runtime/layout.js";
import { width as dispWidth } from "../src/cli/cmd/tui/runtime/text.js";
import { createShell } from "../src/cli/cmd/tui/vanilla/shell.js";
import { defaultTheme } from "../src/cli/cmd/tui/vanilla/theme.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Default to the workspace's established capture dir (src/artifacts), where the
// other TUI screenshots live. (script/ -> ../../../ == the workspace src root.)
const OUT = process.argv[2] || path.resolve(__dirname, "../../../artifacts");
const W = 96, H = 30;

// --- SVG emitter ------------------------------------------------------------
const xml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rgb = c => (c ? `rgb(${c.r},${c.g},${c.b})` : "none");

/**
 * Convert a rendered terminal screen buffer into an SVG string, drawing each cell as a positioned background rect and glyph text with its fg/bg color and bold/italic/underline/inverse attributes, under a caption bar.
 * @param {Object} buf - Terminal-kit ScreenBufferHD to read cells from via buf.get().
 * @param {number} w - Buffer width in columns.
 * @param {number} h - Buffer height in rows.
 * @param {string} title - Caption text rendered in the title bar (XML-escaped).
 * @returns {string} The complete SVG document as a string.
 */
function bufferToSvg(buf, w, h, title) {
  const CW = 8.6, CH = 18, FS = 14, PAD = 10, TITLE_H = 26;
  const wpx = Math.round(w * CW + PAD * 2);
  const hpx = Math.round(h * CH + PAD * 2 + TITLE_H);
  const base = defaultTheme.background;
  const rects = [`<rect width="${wpx}" height="${hpx}" fill="${base}"/>`];
  const texts = [];
  // caption bar
  rects.push(`<rect width="${wpx}" height="${TITLE_H}" fill="${defaultTheme.backgroundElement}"/>`);
  texts.push(`<text x="${PAD}" y="17" fill="${defaultTheme.textMuted}" font-size="12px">${xml(title)}</text>`);
  const oy = TITLE_H + PAD;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = buf.get({ x, y });
      const ch = cell.char;
      if (ch == null || ch === "") continue; // CJK filler cell
      let fg = cell.attr.color, bg = cell.attr.bgColor;
      if (cell.attr.inverse) { const t = fg; fg = bg; bg = t; }
      const cw = Math.max(1, dispWidth(ch));
      const px = +(PAD + x * CW).toFixed(2), py = +(oy + y * CH).toFixed(2);
      const bgHex = rgb(bg);
      if (bgHex !== "none" && (bg.r !== hexR(base) || bg.g !== hexG(base) || bg.b !== hexB(base) || cell.attr.inverse)) {
        rects.push(`<rect x="${px}" y="${py}" width="${(CW * cw).toFixed(2)}" height="${CH}" fill="${bgHex}"/>`);
      }
      if (ch !== " ") {
        const w2 = cell.attr.bold ? ' font-weight="bold"' : "";
        const i2 = cell.attr.italic ? ' font-style="italic"' : "";
        const u2 = cell.attr.underline ? ' text-decoration="underline"' : "";
        texts.push(`<text x="${px}" y="${(py + 13).toFixed(2)}" fill="${rgb(fg)}"${w2}${i2}${u2}>${xml(ch)}</text>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${wpx}" height="${hpx}" font-family="'DejaVu Sans Mono','Cascadia Mono',Menlo,Consolas,monospace" font-size="${FS}px">\n${rects.join("\n")}\n${texts.join("\n")}\n</svg>\n`;
}
const hexR = h => parseInt(h.slice(1, 3), 16), hexG = h => parseInt(h.slice(3, 5), 16), hexB = h => parseInt(h.slice(5, 7), 16);

// --- render one shell into a fresh detached buffer --------------------------
/**
 * Render a TUI shell into a fresh detached ScreenBufferHD of the fixed capture dimensions and return the populated buffer.
 * @param {Object} shell - Vanilla TUI shell instance exposing a draw() method.
 * @returns {Object} The terminal-kit ScreenBufferHD containing the rendered frame.
 */
function render(shell) {
  const buf = new tk.ScreenBufferHD({ width: W, height: H });
  buf.fill({ char: " ", attr: { color: defaultTheme.text, bgColor: defaultTheme.background } });
  shell.draw(makeRegion(buf, 0, 0, W, H), { focusCursor: () => {} });
  return buf;
}

// Representative TS edit diff used by the diff scenarios.
const OLD_CODE = 'export function port() {\n  const p = 3000;\n  return p;\n}';
const NEW_CODE = 'export function port(env) {\n  const p = Number(env.PORT) || 3000;\n  return p;\n}';
/**
 * Populate a shell with a demo session: navigate to a session, push a representative user message and an assistant reply containing markdown and an edit tool diff, then seed the prompt text.
 * @param {Object} shell - Vanilla TUI shell instance to seed with demo conversation state.
 * @returns {void}
 */
function seedChat(shell) {
  shell.navigate({ type: "session", sessionID: "demo" });
  shell.pushMessage({ role: "user", parts: [{ type: "text", text: "Read the dev server port from the PORT env var and show the diff." }] });
  shell.pushMessage({ role: "assistant", parts: [
    { type: "text", text: "I'll update **`config.ts`** so `port()` reads from the environment:\n\n- fall back to `3000` when unset\n- keep the return type" },
    { type: "tool", name: "edit", title: "src/config.ts", path: "src/config.ts", status: "completed", diff: { old: OLD_CODE, new: NEW_CODE } },
  ] });
  shell.prompt.setText("looks good, ship it");
}

const scenarios = [
  { name: "vanilla-tui-01-home", title: "closedcode vanilla TUI — home", build: () => render(createShell()) },
  { name: "vanilla-tui-02-chat-diff-unified", title: "session: markdown + syntax-highlighted unified diff", build: () => { const s = createShell(); seedChat(s); return render(s); } },
  { name: "vanilla-tui-03-diff-split", title: "session: side-by-side (split) diff  [<leader>d / /diff]", build: () => { const s = createShell({ diffView: "split" }); seedChat(s); return render(s); } },
  { name: "vanilla-tui-04-command-palette", title: "command palette  [Ctrl-P]", build: () => { const s = createShell(); s.dispatch("CTRL_P"); return render(s); } },
];

fs.mkdirSync(OUT, { recursive: true });
// PNG by default (emitImage resolves sharp; falls back to SVG only if unavailable).
// Pass --keep-svg to also write the SVG source.
const keepSvg = process.argv.includes("--keep-svg");
const made = [];
for (const sc of scenarios) {
  const svg = bufferToSvg(sc.build(), W, H, sc.title);
  made.push(...await emitImage(path.join(OUT, sc.name), svg, { keepSvg }));
}
console.log("captures ->", OUT);
console.log(made.join("\n"));
