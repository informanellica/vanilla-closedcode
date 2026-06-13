// Message timeline for the vanilla session view (Stage T3, stage 2). The live
// routes/session renders the SDK message store through @opentui parts; this is
// the immediate-mode view over a plain message model — { role, parts } where a
// part is { type:"text"|"reasoning"|"tool"|"file", ... } — wrapped width-aware
// and scrolled, with PageUp/PageDown scrollback. The real part schema/streaming
// is wired at the SDK-integration stage; this covers the rendering + scroll
// behavior, headless-testable.
//
// Scroll model: a `follow` flag (true = pinned to the newest line, the chat
// default) plus, when scrolled up, an ABSOLUTE `topIndex` (top visible line from
// the top). Absolute-from-top means appending below does NOT shift what the user
// is reading (a bottom-relative offset would drift on every streamed token).
// draw() is PURE — it never writes a signal (an earlier bottom-offset clamp wrote
// during the render effect, causing a double repaint per key).
import { createSignal } from "../runtime/reactivity.js";
import { wordWrap, truncate } from "../runtime/text.js";
import { attr, defaultTheme } from "./theme.js";

// One message -> colored display lines (token = a theme color token).
function messageLines(msg, width) {
  const out = [];
  const roleToken = msg.role === "user" ? "primary" : "text";
  for (const part of msg.parts ?? []) {
    if (part.type === "text") {
      const prefix = msg.role === "user" ? "› " : "";
      for (const l of wordWrap(prefix + (part.text ?? ""), width)) out.push({ str: l, token: roleToken });
    } else if (part.type === "reasoning") {
      for (const l of wordWrap(part.text ?? "", width)) out.push({ str: l, token: "textMuted" });
    } else if (part.type === "tool") {
      const token = part.status === "error" ? "error" : part.status === "completed" ? "success" : "warning";
      const title = [part.name, part.title].filter(Boolean).join(" ");
      out.push({ str: truncate("● " + title, width), token });
    } else if (part.type === "file") {
      out.push({ str: truncate("⏎ " + (part.filename ?? part.path ?? "file"), width), token: "secondary" });
    }
  }
  return out;
}

// Flatten all messages to display lines, with a blank separator between them.
export function buildTimelineLines(messages, width) {
  const lines = [];
  messages.forEach((m, i) => {
    if (i > 0) lines.push({ str: "", token: "text" });
    for (const l of messageLines(m, width)) lines.push(l);
  });
  return lines;
}

export function createTimeline(messages, opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const getMessages = typeof messages === "function" ? messages : () => messages;
  const [follow, setFollow] = createSignal(true); // pinned to newest
  const [topIndex, setTopIndex] = createSignal(0); // absolute top line when !follow
  let lastViewH = 1, lastMaxStart = 0;

  // current top line index (clamped to the last render's bounds)
  const curStart = () => (follow() ? lastMaxStart : Math.min(Math.max(0, topIndex()), lastMaxStart));
  // lines hidden below the viewport (kept for back-compat / tests)
  const offset = () => Math.max(0, lastMaxStart - curStart());

  function pin() { setFollow(true); }
  function scrollBy(deltaLines) {
    // Nothing to scroll back to (content fits the viewport): keep following the
    // tail. Otherwise a PageUp here would unfollow at topIndex 0, freezing the
    // view so later streamed/appended lines never scroll in.
    if (lastMaxStart <= 0) { setFollow(true); return; }
    const next = curStart() + deltaLines;
    if (next >= lastMaxStart) { setFollow(true); return; }
    setFollow(false); setTopIndex(Math.max(0, next));
  }
  function handleKey(name) {
    switch (name) {
      case "PAGE_UP": scrollBy(-lastViewH); return true;
      case "PAGE_DOWN": scrollBy(lastViewH); return true;
      default: return false;
    }
  }

  function draw(region) {
    const h = Math.max(1, region.height);
    const lines = buildTimelineLines(getMessages(), region.width);
    // record bounds for the next handleKey/curStart (NO signal writes here)
    lastViewH = h;
    lastMaxStart = Math.max(0, lines.length - h);
    const start = curStart();
    for (let i = 0; i < h && start + i < lines.length; i++) {
      const ln = lines[start + i];
      region.line(i, ln.str, attr(theme, ln.token));
    }
    return { start, maxStart: lastMaxStart, follow: follow(), offset: offset() };
  }

  return { follow, pin, offset, scrollBy, handleKey, draw };
}
