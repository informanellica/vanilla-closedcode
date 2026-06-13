// Node-run tests for the rich-text segment model + markdown renderer.
//   node src/cli/cmd/tui/vanilla/markdown.test.js
import tk from "terminal-kit";
import { makeRegion } from "../runtime/layout.js";
import { width } from "../runtime/text.js";
import { seg, wrapRich, richWidth, drawRichLine, styleToAttr } from "./richtext.js";
import { markdownToRichLines } from "./markdown.js";
import { defaultTheme } from "./theme.js";

let passed = 0, failed = 0;
function eq(a, b, label) { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; console.error(`FAIL ${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); } }
function ok(c, label) { eq(!!c, true, label); }
const lineText = line => line.map(s => s.text).join("");
const styleOf = (line, text) => (line.find(s => s.text === text) || {}).style;

// --- richtext -------------------------------------------------------------
{
  eq(richWidth([seg("ab"), seg("日本")]), 6, "richWidth sums display widths (CJK=2)");
  // wrapRich preserves styles + breaks on spaces
  const wrapped = wrapRich([seg("hello", { bold: true }), seg(" world", { italic: true })], 100);
  eq(wrapped.length, 1, "fits on one line");
  eq(styleOf(wrapped[0], "hello").bold, true, "bold style preserved");
  eq(styleOf(wrapped[0], "world").italic, true, "italic style preserved");
  // CJK hard-wrap of an over-long no-space word
  const cjk = wrapRich([seg("日本語テスト")], 4);
  ok(cjk.every(l => richWidth(l) <= 4), "wrapRich keeps every line within width (CJK)");
  ok(cjk.map(lineText).join("").includes("日本語テスト"), "CJK content preserved across wrap");
  // styleToAttr maps flags
  const a = styleToAttr(defaultTheme, { token: "primary", bold: true });
  eq([a.color, a.bold], [defaultTheme.primary, true], "styleToAttr maps token+bold");
}

// --- drawRichLine renders segments at the right columns -------------------
{
  const buf = new tk.ScreenBuffer({ width: 8, height: 1 }); buf.fill({ char: " " });
  drawRichLine(makeRegion(buf, 0, 0, 8, 1), 0, [seg("ab"), seg("CD", { bold: true }), seg("日")], defaultTheme);
  eq([buf.get({ x: 0, y: 0 }).char, buf.get({ x: 2, y: 0 }).char, buf.get({ x: 4, y: 0 }).char], ["a", "C", "日"], "segments drawn left-to-right, CJK advances 2 cols");
}

// --- markdown: inline styles ----------------------------------------------
{
  const lines = markdownToRichLines("a **b** c `d` ~~e~~ [f](http://x)", 80);
  const l = lines.find(x => lineText(x).includes("b"));
  eq(styleOf(l, "b").bold, true, "**b** -> bold");
  eq(styleOf(l, "d").token, "markdownCode", "`d` -> code token");
  eq(styleOf(l, "e").strike, true, "~~e~~ -> strike");
  eq(styleOf(l, "f").underline, true, "[f](url) -> link underline");
  ok(!lineText(l).includes("http://x"), "link url dropped from rendered text");
}

// --- markdown: headings / hr ----------------------------------------------
{
  const lines = markdownToRichLines("# Title\n\n---", 20);
  const h = lines.find(x => lineText(x) === "Title");
  eq([styleOf(h, "Title").bold, styleOf(h, "Title").token], [true, "markdownHeading"], "# heading -> bold heading token");
  ok(lines.some(x => lineText(x).startsWith("─")), "--- renders a horizontal rule");
}

// --- markdown: lists ------------------------------------------------------
{
  const lines = markdownToRichLines("- one\n- two\n1. first", 40);
  eq(lineText(lines[0]), "• one", "unordered item bullet");
  eq(lineText(lines[1]), "• two", "second unordered item");
  ok(lines.some(x => lineText(x) === "1. first"), "ordered item keeps its number");
}

// --- markdown: code fence + blockquote ------------------------------------
{
  const lines = markdownToRichLines("```js\nconst x = 1\n```\n> quoted", 40);
  const code = lines.find(x => lineText(x).includes("const x = 1"));
  ok(lineText(code).startsWith("│ "), "fenced code line gets a left gutter bar");
  ok(lineText(code).includes("const x = 1"), "fenced code text preserved exactly (highlight tiles input)");
  ok(code.some(s => s.text === "const" && s.style.token === "syntaxKeyword"), "fenced JS code is syntax-highlighted (const -> keyword)");
  const quote = lines.find(x => lineText(x).includes("quoted"));
  ok(lineText(quote).startsWith("▌ "), "blockquote gets a left bar");
  eq(styleOf(quote, "quoted").dim, true, "blockquote text is dim");
}

// --- markdown: paragraph wrap (CJK-aware) ---------------------------------
{
  const lines = markdownToRichLines("日本語の段落テスト ".repeat(5), 12);
  ok(lines.every(l => richWidth(l) <= 12), "paragraph wraps within width (CJK)");
}

// --- regressions from the renderer bug-hunt -------------------------------
{
  // intraword underscore is NOT italic; underscores preserved (snake_case)
  const a = markdownToRichLines("my_var_name and a_b_c", 80).map(lineText).join("");
  eq(a, "my_var_name and a_b_c", "snake_case underscores preserved (no intraword italic)");
  // a true _italic_ at word boundaries still works
  const it = markdownToRichLines("an _emphasised_ word", 80).find(l => l.find(s => s.text === "emphasised"));
  eq(styleOf(it, "emphasised").italic, true, "boundary _italic_ still italic");
  // unbalanced ** stays literal (no phantom deletion)
  eq(markdownToRichLines("5 ** 2 means power", 80).map(lineText).join(""), "5 ** 2 means power", "unbalanced ** kept literal");
  eq(markdownToRichLines("a**b", 80).map(lineText).join(""), "a**b", "stray ** between words kept literal");
}
{
  // narrow CJK list must not lose content (gutter dropped when it can't fit)
  const lines = markdownToRichLines("- 日本語のリスト項目", 3);
  ok(lines.map(lineText).join("").includes("日本語のリスト項目"), "narrow CJK list keeps all content (no silent loss)");
  ok(lines.every(l => richWidth(l) <= 3), "every line within the 3-col pane");
  // a huge ordinal marker on a narrow pane: content survives
  const ol = markdownToRichLines("1234567890. item", 8);
  ok(ol.map(lineText).join("").includes("item"), "list content survives an over-wide marker");
}

console.log(`tui vanilla markdown tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
