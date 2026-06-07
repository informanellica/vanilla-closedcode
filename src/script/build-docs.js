// One-off MDX → HTML converter for the vanilla-closedcode in-app documentation.
// Reads packages/web/src/content/docs/<lang>/<page>.mdx, writes
// packages/desktop-electron/resources/docs/<lang>/<page>.html, plus a single
// docs.css, docs.js, and _index.html language picker.
//
// After running this script once, packages/web/ can be deleted entirely; the
// generated HTML is the canonical source going forward.

import { marked } from "marked"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, "..")
const SRC = path.join(ROOT, "packages/web/src/content/docs")
const OUT = path.join(ROOT, "packages/desktop-electron/resources/docs")

// Pages excluded from the build (OpenCode-social / SaaS / not-shipped paths).
const EXCLUDE = new Set([
  "zen", "enterprise", "share", "web", "go", "ecosystem", "acp",
])

// Language metadata. English lives at SRC root (no en/ directory); the rest
// live in language-coded subdirectories.
const LANGS = [
  { code: "en", name: "English", dir: "" },
  { code: "ar", name: "العربية", dir: "ar" },
  { code: "bs", name: "Bosanski", dir: "bs" },
  { code: "da", name: "Dansk", dir: "da" },
  { code: "de", name: "Deutsch", dir: "de" },
  { code: "es", name: "Español", dir: "es" },
  { code: "fr", name: "Français", dir: "fr" },
  { code: "it", name: "Italiano", dir: "it" },
  { code: "ja", name: "日本語", dir: "ja" },
  { code: "ko", name: "한국어", dir: "ko" },
  { code: "nb", name: "Norsk", dir: "nb" },
  { code: "pl", name: "Polski", dir: "pl" },
  { code: "pt-br", name: "Português (BR)", dir: "pt-br" },
  { code: "ru", name: "Русский", dir: "ru" },
  { code: "th", name: "ไทย", dir: "th" },
  { code: "tr", name: "Türkçe", dir: "tr" },
  { code: "zh-cn", name: "简体中文", dir: "zh-cn" },
  { code: "zh-tw", name: "繁體中文", dir: "zh-tw" },
]

// Strip imports and exports (Starlight uses these for component-style MDX).
function stripModuleStatements(src) {
  return src
    .replace(/^import\s+.+?$/gm, "")
    .replace(/^export\s+const\s+.+?$/gm, "")
    .replace(/^export\s+.+?$/gm, "")
}

// Extract frontmatter (title, description) and the body.
function parseFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) return { fm: {}, body: src }
  const fm = {}
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":")
    if (idx < 0) continue
    const k = line.slice(0, idx).trim()
    let v = line.slice(idx + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    fm[k] = v
  }
  return { fm, body: m[2] }
}

// Convert Starlight asides (:::note / :::tip / :::caution / :::danger) to
// <aside class="note|tip|caution|danger">.
function rewriteAsides(src) {
  return src.replace(
    /^:::(note|tip|caution|danger|warning)(?:\[([^\]]+)\])?\s*\n([\s\S]*?)\n:::\s*$/gm,
    (_, kind, label, body) => {
      const heading = label ? `<p class="aside-label">${escapeHtml(label)}</p>\n` : ""
      return `<aside class="aside aside-${kind}">\n${heading}${body}\n</aside>`
    },
  )
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]))
}

// Convert <Tabs> ... <TabItem label="X"> ... </TabItem> ... </Tabs> into a
// minimal <details>-style fallback. Each TabItem becomes an h4 + content.
function rewriteTabs(src) {
  return src.replace(
    /<Tabs>([\s\S]*?)<\/Tabs>/g,
    (_, inner) => {
      const items = []
      const re = /<TabItem\s+label=("([^"]+)"|'([^']+)')\s*>([\s\S]*?)<\/TabItem>/g
      let m
      while ((m = re.exec(inner))) {
        const label = m[2] ?? m[3] ?? "Tab"
        const body = m[4]
        items.push(`<div class="tab"><h4>${escapeHtml(label)}</h4>\n${body}\n</div>`)
      }
      return `<div class="tabs">\n${items.join("\n")}\n</div>`
    },
  )
}

// Convert <Steps>...ordered list...</Steps> wrapper into <ol class="steps">.
function rewriteSteps(src) {
  return src.replace(
    /<Steps>([\s\S]*?)<\/Steps>/g,
    (_, inner) => `<div class="steps">\n${inner}\n</div>`,
  )
}

// Lightweight text replacements for the fork.
function rewriteBranding(src) {
  return src
    .replace(/\bOpenCode\b/g, "vanilla-closedcode")
    .replace(/\bopencode\.ai\b/g, "github.com/anomalyco/opencode")
}

function langSwitcherHtml(currentLang, currentPage) {
  const opts = LANGS.map((l) => {
    const sel = l.code === currentLang ? " selected" : ""
    // currentPage already has .html extension
    const href = `../${l.code}/${currentPage}`
    return `<option value="${href}"${sel}>${escapeHtml(l.name)}</option>`
  }).join("\n      ")
  return `<nav class="lang-switcher" aria-label="Languages">
    <select onchange="location.href = this.value">
      ${opts}
    </select>
  </nav>`
}

function pageNavHtml(currentLang, allPages, currentPage) {
  const links = allPages.map((p) => {
    const cls = p === currentPage ? ' class="active"' : ""
    const label = p.replace(/\.html$/, "")
    return `<li${cls}><a href="${p}">${escapeHtml(label)}</a></li>`
  }).join("\n      ")
  return `<aside class="sidebar">
    <h3><a href="index.html">${escapeHtml(currentLang)}</a></h3>
    <ul>
      ${links}
    </ul>
  </aside>`
}

function pageTemplate({ lang, langCode, title, description, contentHtml, navHtml, switcherHtml }) {
  return `<!doctype html>
<html lang="${langCode}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — vanilla-closedcode docs</title>
  ${description ? `<meta name="description" content="${escapeHtml(description)}">` : ""}
  <link rel="stylesheet" href="../docs.css">
</head>
<body>
  <header class="page-header">
    <a class="brand" href="index.html">vanilla-closedcode docs</a>
    ${switcherHtml}
  </header>
  <main class="layout">
    ${navHtml}
    <article class="content">
      <h1>${escapeHtml(title)}</h1>
      ${description ? `<p class="lede">${escapeHtml(description)}</p>` : ""}
      ${contentHtml}
    </article>
  </main>
  <footer class="page-footer">
    Adapted from the OpenCode documentation. Local-LLM-only fork.
  </footer>
</body>
</html>
`
}

function indexTemplate({ lang, langCode, pages, switcherHtml }) {
  const items = pages.map((p) => {
    const label = p.replace(/\.html$/, "")
    return `<li><a href="${p}">${escapeHtml(label)}</a></li>`
  }).join("\n        ")
  return `<!doctype html>
<html lang="${langCode}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(lang)} — vanilla-closedcode docs</title>
  <link rel="stylesheet" href="../docs.css">
</head>
<body>
  <header class="page-header">
    <span class="brand">vanilla-closedcode docs</span>
    ${switcherHtml}
  </header>
  <main class="layout">
    <article class="content">
      <h1>vanilla-closedcode documentation (${escapeHtml(lang)})</h1>
      <p class="lede">Adapted from the OpenCode docs. Local-LLM-only fork.</p>
      <ul class="page-index">
        ${items}
      </ul>
    </article>
  </main>
</body>
</html>
`
}

const ROOT_LANG_PICKER = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>vanilla-closedcode docs</title>
  <link rel="stylesheet" href="docs.css">
</head>
<body>
  <main class="picker">
    <h1>vanilla-closedcode documentation</h1>
    <p>Choose your language:</p>
    <ul>
${LANGS.map((l) => `      <li><a href="${l.code}/index.html"><span lang="${l.code}">${escapeHtml(l.name)}</span></a></li>`).join("\n")}
    </ul>
  </main>
</body>
</html>
`

const DOCS_CSS = `:root {
  --fg: #111;
  --fg-muted: #555;
  --bg: #fff;
  --bg-sidebar: #fafafa;
  --bg-code: #f4f4f5;
  --border: #e4e4e7;
  --accent: #2563eb;
  --aside-note: #eff6ff;
  --aside-tip: #ecfdf5;
  --aside-caution: #fffbeb;
  --aside-danger: #fef2f2;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fg: #e5e7eb;
    --fg-muted: #9ca3af;
    --bg: #0a0a0a;
    --bg-sidebar: #111;
    --bg-code: #1f1f23;
    --border: #27272a;
    --accent: #60a5fa;
    --aside-note: #1e293b;
    --aside-tip: #052e2b;
    --aside-caution: #3f2d10;
    --aside-danger: #3f1d1d;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--fg);
  background: var(--bg);
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 10;
}
.brand {
  font-weight: 600;
  color: var(--fg);
  text-decoration: none;
}
.lang-switcher select {
  font: inherit;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--fg);
}
.layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 0;
  max-width: 1200px;
  margin: 0 auto;
}
.sidebar {
  border-right: 1px solid var(--border);
  padding: 24px 16px;
  background: var(--bg-sidebar);
  font-size: 13px;
}
.sidebar h3 { margin: 0 0 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-muted); }
.sidebar h3 a { color: inherit; text-decoration: none; }
.sidebar ul { list-style: none; padding: 0; margin: 0; }
.sidebar li a {
  display: block;
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--fg);
  text-decoration: none;
}
.sidebar li a:hover { background: var(--bg-code); }
.sidebar li.active a { color: var(--accent); font-weight: 600; }
.content {
  padding: 32px 40px;
  min-width: 0;
}
.content h1 { margin-top: 0; }
.content .lede { color: var(--fg-muted); font-size: 16px; margin-top: -4px; }
.content code {
  background: var(--bg-code);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.content pre {
  background: var(--bg-code);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.9em;
}
.content pre code { background: transparent; padding: 0; }
.content a { color: var(--accent); }
.content table { border-collapse: collapse; margin: 16px 0; }
.content th, .content td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
.aside {
  padding: 12px 16px;
  border-radius: 6px;
  border-left: 4px solid var(--border);
  margin: 16px 0;
}
.aside-note { background: var(--aside-note); border-left-color: var(--accent); }
.aside-tip { background: var(--aside-tip); border-left-color: #10b981; }
.aside-caution { background: var(--aside-caution); border-left-color: #f59e0b; }
.aside-danger { background: var(--aside-danger); border-left-color: #ef4444; }
.aside-label { font-weight: 600; margin: 0 0 4px; }
.tabs { border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
.tab + .tab { margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--border); }
.tab h4 { margin: 0 0 8px; font-size: 13px; color: var(--fg-muted); }
.steps { padding-left: 0; }
.page-footer {
  border-top: 1px solid var(--border);
  padding: 16px 24px;
  color: var(--fg-muted);
  font-size: 12px;
  text-align: center;
}
.picker {
  max-width: 480px;
  margin: 64px auto;
  padding: 24px;
  font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.picker h1 { margin-top: 0; }
.picker ul { list-style: none; padding: 0; }
.picker li a {
  display: block;
  padding: 8px 12px;
  border-radius: 6px;
  text-decoration: none;
  color: var(--fg);
}
.picker li a:hover { background: var(--bg-code); }
.page-index { columns: 2; column-gap: 24px; }
.page-index li a { color: var(--accent); text-decoration: none; }
.page-index li a:hover { text-decoration: underline; }
@media (max-width: 720px) {
  .layout { grid-template-columns: 1fr; }
  .sidebar { border-right: none; border-bottom: 1px solid var(--border); }
  .page-index { columns: 1; }
}
`

async function listPagesIn(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".mdx"))
      .map((e) => e.name.replace(/\.mdx$/, ""))
      .filter((slug) => !EXCLUDE.has(slug))
      .sort()
  } catch (e) {
    if (e.code === "ENOENT") return []
    throw e
  }
}

async function readMdx(file) {
  const text = await fs.readFile(file, "utf8")
  // Normalise CRLF / CR to LF; multiple translations carry Windows line endings.
  return text.replace(/\r\n?/g, "\n")
}

async function convertPage({ langCode, langName, slug, srcPath, allPagesForLang }) {
  let src = await readMdx(srcPath)
  src = stripModuleStatements(src)
  const { fm, body } = parseFrontmatter(src)
  let processed = rewriteAsides(body)
  processed = rewriteTabs(processed)
  processed = rewriteSteps(processed)
  processed = rewriteBranding(processed)
  const contentHtml = marked.parse(processed, { mangle: false, headerIds: true })
  const allHtmlPages = allPagesForLang.map((p) => `${p}.html`)
  return pageTemplate({
    lang: langName,
    langCode,
    title: rewriteBranding(fm.title || slug),
    description: rewriteBranding(fm.description || ""),
    contentHtml,
    navHtml: pageNavHtml(langName, allHtmlPages, `${slug}.html`),
    switcherHtml: langSwitcherHtml(langCode, `${slug}.html`),
  })
}

async function main() {
  await fs.rm(OUT, { recursive: true, force: true })
  await fs.mkdir(OUT, { recursive: true })
  await fs.writeFile(path.join(OUT, "docs.css"), DOCS_CSS)
  await fs.writeFile(path.join(OUT, "_index.html"), ROOT_LANG_PICKER)

  let totalPages = 0
  for (const { code, name, dir } of LANGS) {
    const srcDir = dir ? path.join(SRC, dir) : SRC
    const pages = await listPagesIn(srcDir)
    if (pages.length === 0) {
      console.log(`  ${code}: no pages, skipping`)
      continue
    }
    const outDir = path.join(OUT, code)
    await fs.mkdir(outDir, { recursive: true })
    for (const slug of pages) {
      const html = await convertPage({
        langCode: code,
        langName: name,
        slug,
        srcPath: path.join(srcDir, `${slug}.mdx`),
        allPagesForLang: pages,
      })
      await fs.writeFile(path.join(outDir, `${slug}.html`), html)
      totalPages++
    }
    // Write the per-language index
    await fs.writeFile(
      path.join(outDir, "index.html"),
      indexTemplate({
        lang: name,
        langCode: code,
        pages: pages.map((p) => `${p}.html`),
        switcherHtml: langSwitcherHtml(code, "index.html"),
      }),
    )
    console.log(`  ${code}: ${pages.length} pages -> ${path.relative(ROOT, outDir)}`)
  }
  console.log(`\nWrote ${totalPages} pages across ${LANGS.length} languages.`)
  console.log(`Root picker: ${path.relative(ROOT, path.join(OUT, "_index.html"))}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
