// Pure-JS syntax highlighter for the vanilla TUI (renderer parity phase). The
// live timeline hands fenced code blocks (markdown.js) and code lines inside
// diffs (diff.js) to @opentui's syntax-aware renderer; this is a lightweight,
// dependency-free stand-in that tokenizes a single code line into RICH SEGMENTS
// (richtext.js seg shape: { text, style }), so those renderers can colorize code
// without pulling in a real grammar engine.
//
// Design / contract:
//   - highlightLine(line, lang) -> segments[]  : the segments TILE the input
//     EXACTLY (concatenated .text === input line). It NEVER throws — any internal
//     error falls back to a single plaintext segment so callers can render it raw.
//   - highlight(code, lang) -> segments[][]    : one segment array per line.
//   - All whitespace (leading indentation, inner spacing) is preserved verbatim;
//     this is per-LINE highlighting, so multi-line constructs (block comments,
//     template literals spanning lines) are handled best-effort within the line.
//   - Correctness over completeness: a small ordered set of regex rules per
//     language is enough for keyword / string / comment / number coloring. Tokens
//     we can't classify stay as the "codeBlock" fallback (whatever color the
//     theme maps codeBlock to), so output is always readable, never wrong-colored.
//
// style.token values used: syntaxKeyword, syntaxString, syntaxComment,
// syntaxNumber, syntaxType, syntaxFunction, syntaxOperator, syntaxPunctuation;
// the fallback token is "codeBlock" (which the existing theme already defines).
import { seg } from "./richtext.js";

const FALLBACK_TOKEN = "codeBlock";

// --- shared regex fragments -------------------------------------------------
// Each rule is { token, re }. `re` MUST be anchored at the scan position with a
// sticky flag ("y") so we only ever match starting exactly where the scanner is;
// rules are tried in order and the FIRST one that matches wins. A rule that does
// not match at the position is skipped (the scanner falls through to the next
// rule, and finally to a single fallback char if none match).
const sticky = (src, flags = "") => new RegExp(src, "y" + flags);

// Whitespace run: kept as its own un-tokenized (plain) segment so indentation is
// always preserved as literal text regardless of language.
const WS = { token: null, re: sticky("[ \\t]+") };

// Numbers: hex / binary / octal / float / int with optional exponent + suffixes.
const NUMBER = {
  token: "syntaxNumber",
  re: sticky("0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\\d[\\d_]*\\.?[\\d_]*(?:[eE][+-]?\\d+)?[jJlLnufF]*|\\.\\d[\\d_]*(?:[eE][+-]?\\d+)?"),
};

// Identifier (used to detect call sites -> syntaxFunction).
const IDENT = "[A-Za-z_$][A-Za-z0-9_$]*";

// C-style string rules: double / single / backtick, with escape handling, and a
// graceful "unterminated to end-of-line" fallback (so a line that opens a string
// but doesn't close it within the line is still fully tiled as a string).
const dq = { token: "syntaxString", re: sticky('"(?:\\\\.|[^"\\\\])*"|"(?:\\\\.|[^"\\\\])*') };
const sq = { token: "syntaxString", re: sticky("'(?:\\\\.|[^'\\\\])*'|'(?:\\\\.|[^'\\\\])*") };
const bq = { token: "syntaxString", re: sticky("`(?:\\\\.|[^`\\\\])*`|`(?:\\\\.|[^`\\\\])*") };

const lineCommentSlash = { token: "syntaxComment", re: sticky("//.*") };
const lineCommentHash = { token: "syntaxComment", re: sticky("#.*") };
// A block comment opened on this line; consume to its close OR to end-of-line.
const blockComment = { token: "syntaxComment", re: sticky("/\\*[\\s\\S]*?(?:\\*/|$)") };

const OPERATOR = { token: "syntaxOperator", re: sticky("[+\\-*/%=<>!&|^~?:]+") };
const PUNCT = { token: "syntaxPunctuation", re: sticky("[()\\[\\]{}.,;]") };

// Build a keyword/type rule that matches a WHOLE word from a Set, classified to
// the given token. We can't use \b inside a sticky match cleanly, so we capture a
// candidate identifier and accept it only if it's in the set (returning the exact
// matched text). Implemented as a function rule (see scan()).
function wordRule(words, token) {
  const set = words instanceof Set ? words : new Set(words);
  return { token, word: set, re: sticky(IDENT) };
}

// Call-site rule: an identifier immediately followed by "(" -> function name.
// Implemented as a function rule too (peeks the next char after the ident).
const CALL = { token: "syntaxFunction", call: true, re: sticky(IDENT) };
// Plain identifier (no special classification) -> fallback color.
const PLAIN_IDENT = { token: null, re: sticky(IDENT) };

// --- language keyword sets --------------------------------------------------
const JS_KEYWORDS = new Set([
  "abstract", "as", "async", "await", "break", "case", "catch", "class", "const",
  "continue", "debugger", "default", "delete", "do", "else", "enum", "export",
  "extends", "finally", "for", "from", "function", "get", "if", "implements",
  "import", "in", "instanceof", "interface", "let", "new", "of", "package",
  "private", "protected", "public", "readonly", "return", "set", "static",
  "super", "switch", "this", "throw", "try", "typeof", "var", "void", "while",
  "with", "yield", "true", "false", "null", "undefined", "declare", "namespace",
  "type", "keyof", "infer", "satisfies", "override", "is",
]);
const TS_TYPES = new Set([
  "string", "number", "boolean", "any", "unknown", "never", "void", "object",
  "symbol", "bigint", "Array", "Promise", "Record", "Partial", "Readonly",
  "Map", "Set", "Date", "RegExp", "Object", "Function",
]);
const PY_KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def",
  "del", "elif", "else", "except", "finally", "for", "from", "global", "if",
  "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise",
  "return", "try", "while", "with", "yield", "True", "False", "None", "self",
  "cls", "match", "case",
]);
const PY_BUILTINS = new Set([
  "print", "len", "range", "int", "str", "float", "bool", "list", "dict", "set",
  "tuple", "type", "isinstance", "super", "open", "enumerate", "zip", "map",
  "filter", "sorted", "sum", "min", "max", "abs", "input", "format", "repr",
]);
const BASH_KEYWORDS = new Set([
  "if", "then", "else", "elif", "fi", "for", "while", "until", "do", "done",
  "case", "esac", "in", "function", "select", "time", "return", "break",
  "continue", "local", "export", "readonly", "declare", "unset", "shift",
  "source", "alias", "set", "trap", "exit", "eval", "exec", "let",
]);
const BASH_BUILTINS = new Set([
  "echo", "cd", "ls", "cat", "grep", "sed", "awk", "cp", "mv", "rm", "mkdir",
  "rmdir", "touch", "chmod", "chown", "pwd", "test", "read", "printf", "kill",
  "ps", "find", "xargs", "curl", "wget", "git", "npm", "node", "python", "pip",
  "make", "sudo", "apt", "yum", "tar", "gzip", "ssh", "scp", "docker",
]);
const JSON_LITERALS = new Set(["true", "false", "null"]);

// --- per-language rule pipelines --------------------------------------------
// Order matters: comments & strings first (they swallow everything inside),
// then numbers, then keyword/type words, then call sites, then plain idents,
// then operators / punctuation, then whitespace. Anything left becomes a
// 1-char fallback segment.
function jsRules(withTypes) {
  return [
    WS,
    lineCommentSlash,
    blockComment,
    dq, sq, bq,
    NUMBER,
    wordRule(JS_KEYWORDS, "syntaxKeyword"),
    ...(withTypes ? [wordRule(TS_TYPES, "syntaxType")] : []),
    CALL,
    PLAIN_IDENT,
    OPERATOR,
    PUNCT,
  ];
}

function pythonRules() {
  return [
    WS,
    lineCommentHash,
    dq, sq, // python triple-quotes are handled best-effort by the unterminated fallback
    NUMBER,
    wordRule(PY_KEYWORDS, "syntaxKeyword"),
    wordRule(PY_BUILTINS, "syntaxFunction"),
    CALL,
    PLAIN_IDENT,
    OPERATOR,
    PUNCT,
  ];
}

function bashRules() {
  return [
    WS,
    lineCommentHash,
    dq, sq, bq,
    // $VAR / ${VAR} / $(...) treated as a "type"-ish token to stand out.
    { token: "syntaxType", re: sticky("\\$\\{[^}]*\\}|\\$[A-Za-z_][A-Za-z0-9_]*|\\$[\\d@*#?!$-]") },
    NUMBER,
    wordRule(BASH_KEYWORDS, "syntaxKeyword"),
    wordRule(BASH_BUILTINS, "syntaxFunction"),
    PLAIN_IDENT,
    OPERATOR,
    PUNCT,
  ];
}

function jsonRules() {
  return [
    WS,
    dq, // JSON strings are double-quoted (keys & values both)
    NUMBER,
    wordRule(JSON_LITERALS, "syntaxKeyword"),
    PLAIN_IDENT, // bare words other than literals -> fallback color
    OPERATOR,
    PUNCT,
  ];
}

// --- language registry + alias map ------------------------------------------
const LANGS = {
  javascript: jsRules(false),
  typescript: jsRules(true),
  json: jsonRules(),
  python: pythonRules(),
  bash: bashRules(),
};

// Common aliases -> canonical language id. Unknown / falsy langs -> "" (plaintext).
const ALIASES = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  node: "javascript", javascript: "javascript",
  ts: "typescript", tsx: "typescript", typescript: "typescript",
  json: "json", json5: "json", jsonc: "json",
  py: "python", py3: "python", python3: "python", python: "python",
  sh: "bash", shell: "bash", bash: "bash", zsh: "bash", ksh: "bash",
  console: "bash", shellsession: "bash",
};

// Resolve a raw fence language string (e.g. "JS", " ts ", "python3") to a rule
// pipeline. Returns null for plaintext / unknown languages.
export function normalizeLang(lang) {
  const key = String(lang ?? "").trim().toLowerCase();
  return ALIASES[key] ?? null;
}

// Derive a canonical language id from a file path's extension, or null. Callers
// that have a filename but no explicit fence language (the diff renderers, given
// a tool's edited file) use this to turn on syntax coloring. Dotfiles with no
// real extension (".bashrc") and extension-less names ("Makefile") return null.
export function langFromPath(filepath) {
  const base = String(filepath ?? "").replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null; // no extension, or a leading-dot dotfile
  return normalizeLang(base.slice(dot + 1));
}

function rulesFor(lang) {
  const canon = normalizeLang(lang);
  return canon ? LANGS[canon] : null;
}

// Coalesce adjacent segments that share an identical style, so the output is
// compact (e.g. a run of fallback chars becomes one segment). Pure text-preserving.
function coalesce(segments) {
  const out = [];
  for (const s of segments) {
    if (!s.text) continue;
    const prev = out[out.length - 1];
    if (prev && prev.style.token === s.style.token &&
        prev.style.bold === s.style.bold && prev.style.italic === s.style.italic) {
      prev.text += s.text;
    } else {
      out.push(seg(s.text, { ...s.style }));
    }
  }
  return out;
}

// Build a segment for matched text. token===null -> fallback (codeBlock) color.
function emit(out, text, token) {
  if (!text) return;
  out.push(seg(text, { token: token ?? FALLBACK_TOKEN, code: true }));
}

// Core scanner: walk `line` left-to-right, trying rules at each position. Returns
// segments tiling the line exactly. Pure / total (assumes valid inputs; the public
// wrapper guards against throws).
function scan(line, rules) {
  const out = [];
  const n = line.length;
  let i = 0;
  let guard = 0; // defensive: bound the loop to never spin on a zero-width match
  while (i < n) {
    if (++guard > n * 8 + 16) { emit(out, line.slice(i), null); break; }
    let matched = false;
    for (const rule of rules) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(line);
      if (!m || m.index !== i || m[0].length === 0) continue;
      const text = m[0];
      // Word rules: only accept if the matched identifier is in the rule's set.
      if (rule.word) {
        if (!rule.word.has(text)) continue;
        emit(out, text, rule.token);
        i += text.length;
        matched = true;
        break;
      }
      // Call rule: accept an identifier only when immediately followed by "(".
      if (rule.call) {
        let j = i + text.length;
        if (line[j] !== "(") continue; // not a call -> let PLAIN_IDENT handle it
        emit(out, text, rule.token);
        i += text.length;
        matched = true;
        break;
      }
      emit(out, text, rule.token);
      i += text.length;
      matched = true;
      break;
    }
    if (!matched) { emit(out, line[i], null); i += 1; } // unclassified single char
  }
  return coalesce(out);
}

// --- public API -------------------------------------------------------------

// Highlight ONE line into rich segments. The returned segments tile the input
// exactly (concat(.text) === line). Never throws: any failure falls back to a
// single plaintext (codeBlock) segment so the caller can always render the line.
export function highlightLine(line, lang) {
  const text = line == null ? "" : String(line);
  try {
    const rules = rulesFor(lang);
    if (!rules) return text ? [seg(text, { token: FALLBACK_TOKEN, code: true })] : [];
    const segs = scan(text, rules);
    // Total-tiling safety net: if (somehow) the segments don't reconstruct the
    // input, fall back to the raw line rather than render corrupted text.
    if (segs.map(s => s.text).join("") !== text) {
      return text ? [seg(text, { token: FALLBACK_TOKEN, code: true })] : [];
    }
    return segs;
  } catch {
    return text ? [seg(text, { token: FALLBACK_TOKEN, code: true })] : [];
  }
}

// Highlight a whole code block: returns one segment array per line. Line splitting
// normalizes CRLF and preserves empty lines (each becomes []). Never throws.
export function highlight(code, lang) {
  const src = code == null ? "" : String(code);
  const lines = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return lines.map(l => highlightLine(l, lang));
}

// Languages we actively tokenize (for callers that want to gate on support).
export const SUPPORTED_LANGUAGES = Object.keys(LANGS);
