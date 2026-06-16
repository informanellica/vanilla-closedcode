// Pragmatic terminal markdown renderer for the vanilla TUI (renderer parity
// phase). The live timeline hands assistant text to @opentui's <markdown>; this
// converts a markdown string into RICH LINES (styled segments, see richtext.js),
// width-aware, covering the cases chat actually uses: ATX headings, fenced code
// blocks, blockquotes, ordered/unordered lists, horizontal rules, and inline
// bold / italic / `code` / ~~strike~~ / [links](url) / \escapes. Not a full
// CommonMark parser (no tables/nested-list reflow/HTML) — those are rare in chat
// and can be added later; unknown syntax falls through as plain text.
/** @file Pragmatic terminal markdown renderer for the vanilla TUI: converts a markdown string into width-aware rich lines (headings, fenced code, blockquotes, lists, rules, and inline spans). Not a full CommonMark parser. */
import { seg, wrapRich, withGutter } from "./richtext.js";
import { width } from "../runtime/text.js";
import { highlightLine } from "./syntax.js";

/**
 * True when `c` is an ASCII alphanumeric character (used for emphasis word-boundary checks).
 * @param {string} c - A single character (or undefined past the string edge).
 * @returns {boolean} True if alphanumeric.
 */
const ALNUM = c => c != null && /[A-Za-z0-9]/.test(c);

/**
 * Scan inline markdown into styled segments. Recurses for nestable spans
 * (bold/italic/link). Handles code spans, bold, strike, italic, links, and
 * backslash escapes; unbalanced syntax falls through literally.
 * @param {string} text - The inline source text.
 * @param {Object} [base] - Base style applied to plain text (e.g. { token }).
 * @returns {Array} Array of segments; at least one (possibly empty) segment.
 */
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
      // '_' requires word boundaries (CommonMark: no intraword __ emphasis); '*' is loose
      const boundaryOK = ch === "*" || (!ALNUM(text[i - 1]) && !ALNUM(text[end + 2]));
      if (end > i && boundaryOK) { flush(); out.push(...parseInline(text.slice(i + 2, end), { ...base, bold: true })); i = end + 2; continue; }
      buf += m; i += 2; continue; // unbalanced / intraword -> literal "**" (do NOT fall through to single-*)
    }
    if (ch === "~" && text[i + 1] === "~") { // ~~strike~~
      const end = text.indexOf("~~", i + 2);
      if (end > i) { flush(); out.push(...parseInline(text.slice(i + 2, end), { ...base, strike: true })); i = end + 2; continue; }
      buf += "~~"; i += 2; continue; // unbalanced -> literal
    }
    if (ch === "*" || ch === "_") { // *italic* / _italic_
      const end = text.indexOf(ch, i + 1);
      const boundaryOK = ch === "*" || (!ALNUM(text[i - 1]) && !ALNUM(text[end + 1]));
      if (end > i && text[i + 1] !== " " && boundaryOK) { flush(); out.push(...parseInline(text.slice(i + 1, end), { ...base, italic: true })); i = end + 1; continue; }
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

/**
 * Wrap `segs` under a gutter (bullet/quote/number). The wrap budget comes from the
 * gutter's DISPLAY width; if the gutter is too wide (inner < 2) it is dropped so
 * content is never shoved entirely off-region (worst for 2-col CJK glyphs).
 * @param {Array} segs - The content segments to wrap.
 * @param {Object} first - The gutter segment for the first wrapped line.
 * @param {Object} rest - The gutter segment for continuation lines.
 * @param {number} W - The total pane width in columns.
 * @returns {Array} Array of rich lines (each an array of segments).
 */
function gutterBlock(segs, first, rest, W) {
  const gw = Math.max(width(first.text), width(rest.text));
  const inner = W - gw;
  // need >=2 inner cols to hold a fullwidth CJK glyph; otherwise drop the gutter
  if (inner < 2) return wrapRich(segs, Math.max(1, W));
  return withGutter(wrapRich(segs, inner), first, rest);
}

const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^\s*(```|~~~)(.*)$/;
const BLOCKQUOTE = /^\s*>\s?(.*)$/;
const UL = /^(\s*)[-*+]\s+(.*)$/;
const OL = /^(\s*)(\d+)[.)]\s+(.*)$/;

/**
 * Render a markdown string into width-aware rich lines.
 * @param {string} md - The markdown source.
 * @param {number} maxWidth - Available render width in columns.
 * @param {Object} [opts] - Options.
 * @param {string} [opts.baseToken] - Base token for plain text (default "text").
 * @returns {Array} Array of rich lines (each an array of segments).
 */
export function markdownToRichLines(md, maxWidth, opts = {}) {
  const base = { token: opts.baseToken ?? "text" };
  const W = Math.max(1, maxWidth | 0);
  const lines = [];
  const src = String(md ?? "").replace(/\r\n/g, "\n").split("\n");
  let para = [];
  /**
   * Flush the buffered paragraph lines: join, parse inline, wrap, and append.
   * @returns {void}
   */
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
        // verbatim code line, left-gutter bar; syntax-highlighted (highlightLine
        // tiles the input EXACTLY so the text is unchanged — only colors added).
        const body = highlightLine(src[i], lang);
        lines.push([seg("│ ", { token: "markdownQuote", dim: true }), ...(body.length ? body : [seg("", { token: "codeBlock", code: true })])]);
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
      const g = seg("▌ ", { token: "markdownQuote", dim: true });
      for (const l of gutterBlock(parseInline(bq[1], { ...base, dim: true }), g, g, W)) lines.push(l);
      continue;
    }
    const ul = line.match(UL);
    if (ul) {
      flushPara();
      const indent = " ".repeat(ul[1].length);
      for (const l of gutterBlock(parseInline(ul[2], base), seg(indent + "• ", { token: "primary" }), seg(indent + "  ", base), W)) lines.push(l);
      continue;
    }
    const ol = line.match(OL);
    if (ol) {
      flushPara();
      const marker = ol[1] + ol[2] + ". ";
      for (const l of gutterBlock(parseInline(ol[3], base), seg(marker, { token: "primary" }), seg(" ".repeat(width(marker)), base), W)) lines.push(l);
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return lines;
}
