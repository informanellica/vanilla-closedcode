// Node-run tests for the syntax highlighter.  node src/cli/cmd/tui/vanilla/syntax.test.js
import { highlightLine, highlight, normalizeLang, SUPPORTED_LANGUAGES } from "./syntax.js";

let passed = 0, failed = 0;
function eq(a, b, label) { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; console.error(`FAIL ${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } }
function ok(c, label) { eq(!!c, true, label); }

// Helpers over the segment-array shape { text, style:{ token } }.
const recon = segs => segs.map(s => s.text).join("");
// First segment whose text contains `needle` (trim-insensitive for token probing).
const segWith = (segs, needle) => segs.find(s => s.text.includes(needle));
const tokenOf = (segs, needle) => (segWith(segs, needle) || {}).style?.token;
const tokensPresent = segs => new Set(segs.map(s => s.style?.token));

// --- the EXACT-TILING contract (most important invariant) -------------------
{
  const samples = [
    ["const x = 1; // hi", "js"],
    ['let s = "a\\"b";', "javascript"],
    ["    indented(call)", "ts"],
    ["# comment\tonly", "python"],
    ['{ "k": [1, 2, null] }', "json"],
    ["echo $HOME && ls -la", "bash"],
    ["", "js"],
    ["plain text no lang", "weird-unknown-lang"],
    ["mixed 漢字 and code()", "js"],     // CJK preserved verbatim
    ["unterminated 'string here", "python"],
    ["/* block comment not closed", "ts"],
  ];
  let allTile = true;
  for (const [line, lang] of samples) {
    const segs = highlightLine(line, lang);
    if (recon(segs) !== line) { allTile = false; console.error(`  tiling broke for (${lang}): ${JSON.stringify(line)} -> ${JSON.stringify(recon(segs))}`); }
  }
  ok(allTile, "highlightLine output tiles every sample line EXACTLY (concat === input)");
  // empty line -> empty segment list (no phantom segment)
  eq(highlightLine("", "js"), [], "empty line -> no segments");
}

// --- never throws -----------------------------------------------------------
{
  let threw = false;
  for (const bad of [null, undefined, 123, {}, [], "ok"]) {
    try { highlightLine(bad, null); highlightLine("x", bad); } catch { threw = true; }
  }
  ok(!threw, "highlightLine never throws on odd inputs (null/number/object/array)");
  // null/undefined code -> single empty-line block, no throw
  eq(highlight(null, "js"), [[]], "highlight(null) -> one empty line");
}

// --- JavaScript: keyword / string / number / comment ------------------------
{
  const segs = highlightLine('const name = "Ada"; // author', "javascript");
  eq(tokenOf(segs, "const"), "syntaxKeyword", "JS keyword 'const' -> syntaxKeyword");
  eq(tokenOf(segs, '"Ada"'), "syntaxString", "JS string '\"Ada\"' -> syntaxString");
  eq(tokenOf(segs, "// author"), "syntaxComment", "JS line comment -> syntaxComment");
  // a number on its own line so it isn't part of an identifier
  const num = highlightLine("x = 42 + 3.14e2", "js");
  eq(tokenOf(num, "42"), "syntaxNumber", "JS integer 42 -> syntaxNumber");
  eq(tokenOf(num, "3.14e2"), "syntaxNumber", "JS float 3.14e2 -> syntaxNumber");
  // call site -> syntaxFunction, but the plain identifier is NOT a function
  const call = highlightLine("doThing(arg)", "js");
  eq(tokenOf(call, "doThing"), "syntaxFunction", "JS call site 'doThing(' -> syntaxFunction");
  eq(tokenOf(call, "arg"), "codeBlock", "JS bare identifier 'arg' -> fallback codeBlock");
}

// --- TypeScript: types are recognized (and only in TS, not plain JS) --------
{
  const ts = highlightLine("let n: number = 0", "typescript");
  eq(tokenOf(ts, "number"), "syntaxType", "TS type 'number' -> syntaxType");
  eq(tokenOf(ts, "let"), "syntaxKeyword", "TS keyword 'let' -> syntaxKeyword");
  // in plain JS, 'number' is just an identifier (no type table) -> fallback
  const js = highlightLine("let n = number", "javascript");
  eq(tokenOf(js, "number"), "codeBlock", "plain JS does NOT treat 'number' as a type");
}

// --- JSON: literals, strings, numbers, punctuation --------------------------
{
  const segs = highlightLine('{ "id": 7, "ok": true, "x": null }', "json");
  eq(tokenOf(segs, '"id"'), "syntaxString", "JSON key string -> syntaxString");
  eq(tokenOf(segs, "7"), "syntaxNumber", "JSON number 7 -> syntaxNumber");
  eq(tokenOf(segs, "true"), "syntaxKeyword", "JSON literal 'true' -> syntaxKeyword");
  eq(tokenOf(segs, "null"), "syntaxKeyword", "JSON literal 'null' -> syntaxKeyword");
  ok(tokensPresent(segs).has("syntaxPunctuation"), "JSON braces/commas -> syntaxPunctuation present");
}

// --- Python: keyword / def name / string / comment / number -----------------
{
  const segs = highlightLine('def greet(n):  # say hi', "python");
  eq(tokenOf(segs, "def"), "syntaxKeyword", "Python keyword 'def' -> syntaxKeyword");
  eq(tokenOf(segs, "greet"), "syntaxFunction", "Python def name 'greet(' -> syntaxFunction");
  eq(tokenOf(segs, "# say hi"), "syntaxComment", "Python '#' comment -> syntaxComment");
  const s = highlightLine("msg = 'hello' if True else None", "py");
  eq(tokenOf(s, "'hello'"), "syntaxString", "Python single-quoted string -> syntaxString");
  eq(tokenOf(s, "True"), "syntaxKeyword", "Python literal 'True' -> syntaxKeyword");
  eq(tokenOf(s, "if"), "syntaxKeyword", "Python keyword 'if' -> syntaxKeyword");
  const n = highlightLine("total = 100 + 0x1F", "python");
  eq(tokenOf(n, "100"), "syntaxNumber", "Python int 100 -> syntaxNumber");
  eq(tokenOf(n, "0x1F"), "syntaxNumber", "Python hex 0x1F -> syntaxNumber");
}

// --- Bash: keyword / builtin / var / comment --------------------------------
{
  const segs = highlightLine("if [ -n $HOME ]; then echo hi; fi  # check", "bash");
  eq(tokenOf(segs, "if"), "syntaxKeyword", "Bash keyword 'if' -> syntaxKeyword");
  eq(tokenOf(segs, "echo"), "syntaxFunction", "Bash builtin 'echo' -> syntaxFunction");
  eq(tokenOf(segs, "$HOME"), "syntaxType", "Bash variable '$HOME' (unquoted) -> syntaxType");
  eq(tokenOf(segs, "# check"), "syntaxComment", "Bash '#' comment -> syntaxComment");
}

// --- whitespace / indentation preserved -------------------------------------
{
  const segs = highlightLine("        return x", "python");
  eq(recon(segs), "        return x", "leading 8-space indent preserved verbatim");
  ok(segs[0].text.startsWith("        "), "first segment carries the literal indentation");
  // tabs preserved as-is (highlighter does not expand; that's the renderer's job)
  const tabbed = highlightLine("\tconst y = 1", "js");
  eq(recon(tabbed), "\tconst y = 1", "leading tab preserved (not expanded here)");
}

// --- alias map + plaintext fallback -----------------------------------------
{
  eq(normalizeLang("JS"), "javascript", "alias JS -> javascript");
  eq(normalizeLang(" ts "), "typescript", "alias ' ts ' (trim+lower) -> typescript");
  eq(normalizeLang("py3"), "python", "alias py3 -> python");
  eq(normalizeLang("sh"), "bash", "alias sh -> bash");
  eq(normalizeLang("shell"), "bash", "alias shell -> bash");
  eq(normalizeLang("totally-unknown"), null, "unknown lang -> null (plaintext)");
  // plaintext fallback: one codeBlock segment covering the whole line
  const plain = highlightLine("anything goes here 123", "");
  eq(plain.length, 1, "plaintext fallback is a single segment");
  eq(plain[0].style.token, "codeBlock", "plaintext fallback token -> codeBlock");
  eq(recon(plain), "anything goes here 123", "plaintext fallback tiles the line");
  ok(SUPPORTED_LANGUAGES.includes("javascript") && SUPPORTED_LANGUAGES.includes("python"), "SUPPORTED_LANGUAGES lists the tokenized langs");
}

// --- highlight() block: per-line arrays, CRLF normalized --------------------
{
  const block = highlight("const a = 1\nconst b = 2", "js");
  eq(block.length, 2, "highlight() returns one array per line");
  ok(recon(block[0]) === "const a = 1" && recon(block[1]) === "const b = 2", "each block line reconstructs");
  const crlf = highlight("a\r\nb", "js");
  eq(crlf.length, 2, "CRLF normalized to 2 lines (no phantom empty line)");
}

console.log(`tui vanilla syntax tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
