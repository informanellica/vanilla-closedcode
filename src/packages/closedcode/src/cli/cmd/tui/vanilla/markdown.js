// Pragmatic terminal markdown renderer for the vanilla TUI (renderer parity
// phase). The live timeline hands assistant text to @opentui's <markdown>; this
// converts a markdown string into RICH LINES (styled segments, see richtext.js),
// width-aware, covering the cases chat actually uses: ATX headings, fenced code
// blocks, blockquotes, ordered/unordered lists, horizontal rules, and inline
// bold / italic / `code` / ~~strike~~ / [links](url) / \escapes. Not a full
// CommonMark parser (no tables/nested-list reflow/HTML) — those are rare in chat
// and can be added later; unknown syntax falls through as plain text.
import { seg, wrapRich, withGutter } from "./richtext.js";
import { width } from "../runtime/text.js";

// Inline scan -> styled segments. Recurses for nestable spans (bold/italic/link).
function parseInline(text, base = {}) {
  const out = [];
  let buf = "";
  const flush = () => { if (buf) { out.push(seg(buf, base)); buf = ""; } };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) { buf += text[i + 1]; i += 2; continue; }
    if (ch === "`") { // code span (verbatim, highest precedence)
      const end = text.indexOf("`", i + 1);
      if (end > i) { flush(); out.push(seg(text.slice(i + 1, end), { ...base, token: "markdownCode", code: true })); i = end + 1; continue; }
    }
    if ((ch === "*" || ch === "_") && text[i + 1] === ch) { // **bold** / __bold__
      const m = ch + ch, end = text.indexOf(m, i + 2);
      if (end > i) { flush(); out.push(...parseInline(text.slice(i + 2, end), { ...base, bold: true })); i = end + 2; continue; }
    }
    if (ch === "~" && text[i + 1] === "~") { // ~~strike~~
      const end = text.indexOf("~~", i + 2);
      if (end > i) { flush(); out.push(...parseInline(text.slice(i + 2, end), { ...base, strike: true })); i = end + 2; continue; }
    }
    if (ch === "*" || ch === "_") { // *italic* / _italic_
      const end = text.indexOf(ch, i + 1);
      if (end > i && text[i + 1] !== " ") { flush(); out.push(...parseInline(text.slice(i + 1, end), { ...base, italic: true })); i = end + 1; continue; }
    }
    if (ch === "[") { // [label](url)
      const close = text.indexOf("]", i + 1);
      if (close > i && text[close + 1] === "(") {
        const paren = text.indexOf(")", close + 2);
        if (paren > close) { flush(); out.push(...parseInline(text.slice(i + 1, close), { ...base, token: "markdownLink", underline: true })); i = paren + 1; continue; }
      }
    }
    buf += ch; i++;
  }
  flush();
  return out.length ? out : [seg("", base)];
}

const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^\s*(```|~~~)(.*)$/;
const BLOCKQUOTE = /^\s*>\s?(.*)$/;
const UL = /^(\s*)[-*+]\s+(.*)$/;
const OL = /^(\s*)(\d+)[.)]\s+(.*)$/;

export function markdownToRichLines(md, maxWidth, opts = {}) {
  const base = { token: opts.baseToken ?? "text" };
  const W = Math.max(1, maxWidth | 0);
  const lines = [];
  const src = String(md ?? "").replace(/\r\n/g, "\n").split("\n");
  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    const segs = parseInline(para.join(" "), base);
    for (const l of wrapRich(segs, W)) lines.push(l);
    para = [];
  };

  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    const fence = line.match(FENCE);
    if (fence) { // fenced code block: collect verbatim to the closing fence
      flushPara();
      const lang = fence[2].trim();
      if (lang) lines.push([seg(lang, { token: "markdownQuote", dim: true })]);
      i++;
      for (; i < src.length && !src[i].match(FENCE); i++) {
        // verbatim code line, left-gutter bar; truncated (not wrapped) to width
        lines.push([seg("│ ", { token: "markdownQuote", dim: true }), seg(src[i], { token: "codeBlock", code: true })]);
      }
      continue;
    }
    if (line.trim() === "") { flushPara(); lines.push([seg("", base)]); continue; }
    if (HR.test(line)) { flushPara(); lines.push([seg("─".repeat(W), { token: "markdownQuote", dim: true })]); continue; }
    const h = line.match(HEADING);
    if (h) { flushPara(); for (const l of wrapRich(parseInline(h[2], { ...base, token: "markdownHeading", bold: true }), W)) lines.push(l); continue; }
    const bq = line.match(BLOCKQUOTE);
    if (bq) {
      flushPara();
      const inner = wrapRich(parseInline(bq[1], { ...base, dim: true }), Math.max(1, W - 2));
      for (const l of withGutter(inner, seg("▌ ", { token: "markdownQuote", dim: true }), seg("▌ ", { token: "markdownQuote", dim: true }))) lines.push(l);
      continue;
    }
    const ul = line.match(UL);
    if (ul) {
      flushPara();
      const indent = " ".repeat(ul[1].length);
      const inner = wrapRich(parseInline(ul[2], base), Math.max(1, W - ul[1].length - 2));
      for (const l of withGutter(inner, seg(indent + "• ", { token: "primary" }), seg(indent + "  ", base))) lines.push(l);
      continue;
    }
    const ol = line.match(OL);
    if (ol) {
      flushPara();
      const marker = ol[1] + ol[2] + ". ";
      const inner = wrapRich(parseInline(ol[3], base), Math.max(1, W - marker.length));
      for (const l of withGutter(inner, seg(marker, { token: "primary" }), seg(" ".repeat(marker.length), base))) lines.push(l);
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return lines;
}
