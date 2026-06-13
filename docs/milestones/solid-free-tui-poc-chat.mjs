// terminal-kit chat PoC — verifies the de-risking items for replacing @opentui
// with a pure-JS TUI base:
//   - CJK fullwidth (Japanese) rendering & width-aware wrapping
//   - scrolling message list
//   - text input line (type Japanese/ASCII, Enter to send)
//   - delta ScreenBuffer.draw (incremental redraw, no full clear/flicker)
//   - terminal resize handling
//
// Run in a REAL terminal (Windows Terminal / Git Bash / WSL):
//   node chat-poc.mjs
// Keys:  ↑/↓ or PageUp/PageDown scroll · type text · Enter send · Backspace · q or Ctrl-C quit
import tk from "terminal-kit";
import stringKit from "string-kit";

const term = tk.terminal;
const width = str => stringKit.unicode.width(str); // fullwidth-aware display width

// ---- state (plain JS object, like the proposed design) ---------------------
const state = {
  messages: [
    "ようこそ。これは terminal-kit の最小チャット PoC です。",
    "日本語の全角文字（あいうえお・漢字・記号）が正しい幅で描画されるか確認します。",
    "ABC abc 123 — 半角と全角が混在 → 日本語Mixでもカーソル位置がずれないこと。",
    "長い行の折り返しテスト：" + "あ".repeat(60) + "END",
    "絵文字も2幅: 🎉🚀✨ — terminal によっては幅が揺れるので要観察。",
    ...Array.from({ length: 30 }, (_, i) => `メッセージ #${i + 1}：スクロール確認用のダミー行（日本語）。`),
  ],
  input: "",
  scroll: 0, // lines scrolled up from bottom
  status: "idle",
};

let sb;
function makeBuffer() {
  sb = new tk.ScreenBuffer({ dst: term, width: term.width, height: term.height });
}

// width-aware word/char wrap: split a string into lines no wider than `max` cells
function wrap(str, max) {
  const out = [];
  let line = "";
  let w = 0;
  for (const ch of str) {
    const cw = width(ch);
    if (w + cw > max) { out.push(line); line = ch; w = cw; }
    else { line += ch; w += cw; }
  }
  out.push(line);
  return out;
}

const HEADER_ATTR = { color: "white", bgColor: "blue", bold: true };
const STATUS_ATTR = { color: "black", bgColor: "gray" };
const INPUT_ATTR = { color: "brightWhite", bgColor: "black" };

function render() {
  const W = term.width, H = term.height;
  sb.fill({ attr: { bgColor: "black", color: "white" }, char: " " });

  // header (row 0)
  const title = " Vanilla TUI PoC — terminal-kit (no OpenTUI / no Solid / no native) ";
  sb.put({ x: 0, y: 0, attr: HEADER_ATTR }, title.padEnd(W).slice(0, W));

  // message area: rows 1 .. H-3
  const areaTop = 1, areaBottom = H - 3, areaH = areaBottom - areaTop + 1;
  // flatten messages to wrapped lines
  const lines = [];
  for (const m of state.messages) for (const l of wrap(m, W - 1)) lines.push(l);
  const maxScroll = Math.max(0, lines.length - areaH);
  if (state.scroll > maxScroll) state.scroll = maxScroll;
  const start = Math.max(0, lines.length - areaH - state.scroll);
  const visible = lines.slice(start, start + areaH);
  for (let i = 0; i < visible.length; i++) {
    sb.put({ x: 0, y: areaTop + i, attr: { color: "white" }, wrap: false }, visible[i]);
  }

  // status (row H-2)
  const status = ` ${state.status} · ${lines.length} lines · scroll ${state.scroll}/${maxScroll} · ${W}x${H} · q=quit `;
  sb.put({ x: 0, y: H - 2, attr: STATUS_ATTR }, status.padEnd(W).slice(0, W));

  // input (row H-1)
  const prompt = "› ";
  const inputLine = (prompt + state.input);
  sb.put({ x: 0, y: H - 1, attr: INPUT_ATTR }, inputLine.padEnd(W).slice(0, W));

  // place the cursor at the end of the input (fullwidth-aware column)
  const cx = Math.min(W - 1, width(inputLine));
  sb.moveTo(cx, H - 1);

  sb.draw({ delta: true }); // <-- incremental redraw
  sb.drawCursor();
}

function quit() {
  term.grabInput(false);
  term.hideCursor(false);
  term.styleReset();
  term.clear();
  term.moveTo(1, term.height);
  process.exit(0);
}

// ---- input handling --------------------------------------------------------
term.fullscreen(true);
term.hideCursor();
makeBuffer();
term.grabInput({ mouse: false });

term.on("key", (name, _matches, data) => {
  if (name === "CTRL_C" || name === "q") return quit();
  if (name === "ENTER") {
    if (state.input.trim()) { state.messages.push("あなた: " + state.input); state.scroll = 0; }
    state.input = "";
  } else if (name === "BACKSPACE") {
    state.input = [...state.input].slice(0, -1).join("");
  } else if (name === "UP") {
    state.scroll++;
  } else if (name === "DOWN") {
    state.scroll = Math.max(0, state.scroll - 1);
  } else if (name === "PAGE_UP") {
    state.scroll += 5;
  } else if (name === "PAGE_DOWN") {
    state.scroll = Math.max(0, state.scroll - 5);
  } else if (data && data.isCharacter) {
    // printable character (includes multibyte / Japanese when the terminal/IME delivers it)
    state.input += name;
  }
  render();
});

term.on("resize", () => { makeBuffer(); render(); });

render();
