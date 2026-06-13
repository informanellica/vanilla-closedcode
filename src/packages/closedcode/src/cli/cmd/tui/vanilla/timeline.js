// Message timeline for the vanilla session view. Renders the plain message model
// { role, parts:[{type:"text"|"reasoning"|"tool"|"file", ...}] } into RICH LINES
// (styled segments, richtext.js): assistant text goes through the markdown
// renderer (bold/code/lists/…), user text is a plain "›"-marked bubble, reasoning
// is dim, tool parts are a status-colored bullet. Scroll is follow + absolute
// topIndex (appends below don't shift a scrolled view); draw() is pure (no signal
// writes). Width-aware / CJK-safe throughout.
import { createSignal } from "../runtime/reactivity.js";
import { truncate } from "../runtime/text.js";
import { defaultTheme } from "./theme.js";
import { seg, wrapRich, withGutter, drawRichLine } from "./richtext.js";
import { markdownToRichLines } from "./markdown.js";

// One message -> rich display lines.
function messageLines(msg, width) {
  const out = [];
  for (const part of msg.parts ?? []) {
    if (part.type === "text") {
      if (part.synthetic || part.ignored) continue;
      if (msg.role === "user") {
        const wrapped = wrapRich([seg(part.text ?? "", { token: "primary" })], Math.max(1, width - 2));
        for (const l of withGutter(wrapped, seg("› ", { token: "primary" }), seg("  ", {}))) out.push(l);
      } else {
        for (const l of markdownToRichLines(part.text ?? "", width, { baseToken: "text" })) out.push(l);
      }
    } else if (part.type === "reasoning") {
      if (!part.text) continue;
      for (const l of wrapRich([seg(part.text, { token: "textMuted", dim: true })], width)) out.push(l);
    } else if (part.type === "tool") {
      const token = part.status === "error" ? "error" : part.status === "completed" ? "success" : "warning";
      const title = [part.name, part.title].filter(Boolean).join(" ");
      out.push([seg(truncate("● " + title, width), { token })]);
    } else if (part.type === "file") {
      out.push([seg(truncate("⏎ " + (part.filename ?? part.path ?? "file"), width), { token: "secondary" })]);
    }
  }
  return out;
}

// Flatten all messages to rich lines, with a blank separator between them.
export function buildTimelineLines(messages, width) {
  const lines = [];
  messages.forEach((m, i) => {
    if (i > 0) lines.push([seg("", {})]);
    for (const l of messageLines(m, width)) lines.push(l);
  });
  return lines;
}

export function createTimeline(messages, opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const getMessages = typeof messages === "function" ? messages : () => messages;
  const [follow, setFollow] = createSignal(true);
  const [topIndex, setTopIndex] = createSignal(0);
  let lastViewH = 1, lastMaxStart = 0;

  const curStart = () => (follow() ? lastMaxStart : Math.min(Math.max(0, topIndex()), lastMaxStart));
  const offset = () => Math.max(0, lastMaxStart - curStart());

  function pin() { setFollow(true); }
  function scrollBy(deltaLines) {
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
    lastViewH = h;
    lastMaxStart = Math.max(0, lines.length - h);
    const start = curStart();
    for (let i = 0; i < h && start + i < lines.length; i++) drawRichLine(region, i, lines[start + i], theme);
    return { start, maxStart: lastMaxStart, follow: follow(), offset: offset() };
  }

  return { follow, pin, offset, scrollBy, handleKey, draw };
}
