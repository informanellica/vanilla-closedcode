import { marked } from "marked";
import remend from "remend";
function refs(text) {
  return /^\[[^\]]+\]:\s+\S+/m.test(text) || /^\[\^[^\]]+\]:\s+/m.test(text);
}
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
function heal(text) {
  return remend(text, {
    linkMode: "text-only"
  });
}
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