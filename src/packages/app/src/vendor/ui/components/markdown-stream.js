/** @file Splits streaming markdown text into renderable blocks, healing incomplete syntax for live updates. */
import { marked } from "marked";
import remend from "remend";
/**
 * Detect whether the text contains link or footnote reference definitions.
 * @param {string} text - Markdown source to inspect.
 * @returns {boolean} True if a link-reference or footnote-reference definition line is present.
 */
function refs(text) {
  return /^\[[^\]]+\]:\s+\S+/m.test(text) || /^\[\^[^\]]+\]:\s+/m.test(text);
}
/**
 * Determine whether a fenced code block is still open (its closing fence has not yet been written).
 * @param {string} raw - The raw markdown of the trailing code token.
 * @returns {boolean} True when the fence is open (no matching closing fence on the last line).
 */
function open(raw) {
  const match = raw.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  if (!match) return false;
  const mark = match[1];
  if (!mark) return false;
  const char = mark[0];
  const size = mark.length;
  const last = raw.trimEnd().split("\n").at(-1)?.trim() ?? "";
  return !new RegExp(`^[\\t ]{0,3}${char}{${size},}[\\t ]*$`).test(last);
}
/**
 * Repair incomplete/streaming markdown so it renders cleanly mid-stream.
 * @param {string} text - Possibly-incomplete markdown source.
 * @returns {string} Healed markdown safe to parse (links rendered as text-only).
 */
function heal(text) {
  return remend(text, {
    linkMode: "text-only"
  });
}
/**
 * Split markdown into render blocks, isolating a still-open trailing code fence so
 * the stable head can be cached while the live tail keeps updating.
 * @param {string} text - The markdown source to split.
 * @param {boolean} live - When true, heal the text and split off an open trailing code block for live rendering.
 * @returns {Array<Object>} Block descriptors `{ raw, src, mode }` where `mode` is "full" or "live".
 */
export function stream(text, live) {
  if (!live) return [{
    raw: text,
    src: text,
    mode: "full"
  }];
  const src = heal(text);
  if (refs(text)) return [{
    raw: text,
    src,
    mode: "live"
  }];
  const tokens = marked.lexer(text);
  const tail = tokens.findLastIndex(token => token.type !== "space");
  if (tail < 0) return [{
    raw: text,
    src,
    mode: "live"
  }];
  const last = tokens[tail];
  if (!last || last.type !== "code") return [{
    raw: text,
    src,
    mode: "live"
  }];
  const code = last;
  if (!open(code.raw)) return [{
    raw: text,
    src,
    mode: "live"
  }];
  const head = tokens.slice(0, tail).map(token => token.raw).join("");
  if (!head) return [{
    raw: code.raw,
    src: code.raw,
    mode: "live"
  }];
  return [{
    raw: head,
    src: heal(head),
    mode: "live"
  }, {
    raw: code.raw,
    src: code.raw,
    mode: "live"
  }];
}