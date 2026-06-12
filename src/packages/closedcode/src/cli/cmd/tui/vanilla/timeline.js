// Message timeline for the vanilla session view (Stage T3, stage 2). The live
// routes/session renders the SDK message store through @opentui parts; this is
// the immediate-mode view over a plain message model — { role, parts } where a
// part is { type:"text"|"reasoning"|"tool"|"file", ... } — wrapped width-aware
// and windowed bottom-pinned (newest at the bottom), with PageUp/PageDown
// scrollback. The real part schema/streaming is wired at the SDK-integration
// stage; this covers the rendering + scroll behavior, headless-testable.
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
  const [offset, setOffset] = createSignal(0); // lines hidden below the viewport (0 = bottom)
  let lastViewH = 1;

  function handleKey(name) {
    switch (name) {
      case "PAGE_UP": setOffset(o => o + lastViewH); return true;
      case "PAGE_DOWN": setOffset(o => Math.max(0, o - lastViewH)); return true;
      default: return false;
    }
  }

  function draw(region) {
    const h = region.height;
    lastViewH = Math.max(1, h);
    const lines = buildTimelineLines(getMessages(), region.width);
    const maxScroll = Math.max(0, lines.length - h);
    const off = Math.min(Math.max(0, offset() | 0), maxScroll);
    if (off !== offset()) setOffset(off);
    const start = Math.max(0, lines.length - h - off);
    for (let i = 0; i < h && start + i < lines.length; i++) {
      const ln = lines[start + i];
      region.line(i, ln.str, attr(theme, ln.token));
    }
    return { offset: off, maxScroll };
  }

  return { offset, setOffset, handleKey, draw };
}
