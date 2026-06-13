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
import { renderUnifiedDiff, renderTextDiff } from "./diff.js";
import { renderSplitDiff, renderSplitUnified } from "./splitdiff.js";
import { langFromPath } from "./syntax.js";

const TOOL_DETAIL_CAP = 8; // max detail (diff/output) lines shown per tool part

// One message -> rich display lines. opts.split renders tool diffs side-by-side.
function messageLines(msg, width, opts = {}) {
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
      // detail: a diff (edit/write) or text output (read/bash/…), indented + capped
      const innerW = Math.max(1, width - 2);
      // The tool's edited file path drives syntax coloring of the diff. Use the
      // real path the store derives (part.path); fall back to the title only when
      // it is a single-line string (a path), never a multi-line apply_patch summary.
      const titlePath = typeof part.title === "string" && !part.title.includes("\n") ? part.title : undefined;
      const diffOpts = { lang: langFromPath(part.path ?? titlePath) };
      const split = !!opts.split;
      let detail = [];
      if (part.diff) {
        if (typeof part.diff === "string") detail = split ? renderSplitUnified(part.diff, innerW, diffOpts) : renderUnifiedDiff(part.diff, innerW, diffOpts);
        else detail = split ? renderSplitDiff(part.diff.old, part.diff.new, innerW, diffOpts) : renderTextDiff(part.diff.old, part.diff.new, innerW, diffOpts);
      }
      else if (part.output) detail = part.output.replace(/\r\n/g, "\n").split("\n").map(l => [seg(truncate(l, innerW), { token: "codeBlock", code: true })]);
      for (const l of detail.slice(0, TOOL_DETAIL_CAP)) out.push([seg("  ", {}), ...l]);
      if (detail.length > TOOL_DETAIL_CAP) out.push([seg(`  … (+${detail.length - TOOL_DETAIL_CAP} more lines)`, { token: "textMuted", dim: true })]);
    } else if (part.type === "file") {
      out.push([seg(truncate("⏎ " + (part.filename ?? part.path ?? "file"), width), { token: "secondary" })]);
    }
  }
  return out;
}

// Flatten all messages to rich lines, with a blank separator between them.
// opts.split is forwarded to each message's tool-diff rendering.
export function buildTimelineLines(messages, width, opts = {}) {
  const lines = [];
  messages.forEach((m, i) => {
    if (i > 0) lines.push([seg("", {})]);
    for (const l of messageLines(m, width, opts)) lines.push(l);
  });
  return lines;
}

export function createTimeline(messages, opts = {}) {
  const theme = opts.theme ?? defaultTheme;
  const getMessages = typeof messages === "function" ? messages : () => messages;
  const isSplit = () => (typeof opts.diffView === "function" ? opts.diffView() === "split" : false);
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
    const lines = buildTimelineLines(getMessages(), region.width, { split: isSplit() });
    lastViewH = h;
    lastMaxStart = Math.max(0, lines.length - h);
    const start = curStart();
    for (let i = 0; i < h && start + i < lines.length; i++) drawRichLine(region, i, lines[start + i], theme);
    return { start, maxStart: lastMaxStart, follow: follow(), offset: offset() };
  }

  return { follow, pin, offset, scrollBy, handleKey, draw };
}
