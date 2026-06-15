// Lightweight right-click context menu for the file explorer. Bootstrap-styled
// (.dropdown-menu) positioned at the cursor, kept inside the viewport. File
// operations go through the window.api fs-* IPC bridge (see preload). A
// module-level clipboard holds the copy/cut source for paste.
import { confirmModal } from "../../bs/confirm.js";
let menuEl = null;
let clipboard = null; // { op: "copy" | "cut", path }
let lastXY = { x: 120, y: 120 };

// Inline editable name frame (replaces window.prompt): a small floating input
// at the menu location. Resolves to the trimmed value, or null on Escape/empty.
function promptInline(initial, label) {
  return new Promise(resolve => {
    const wrap = document.createElement("div");
    wrap.className = "dropdown-menu show p-2";
    wrap.style.cssText = `position:fixed;z-index:2100;min-width:220px;left:${lastXY.x}px;top:${lastXY.y}px;`;
    if (label) {
      const l = document.createElement("div");
      l.className = "small text-secondary mb-1";
      l.textContent = label;
      wrap.appendChild(l);
    }
    const input = document.createElement("input");
    input.type = "text";
    input.className = "form-control form-control-sm";
    input.value = initial || "";
    wrap.appendChild(input);
    document.body.appendChild(wrap);
    const r = wrap.getBoundingClientRect();
    if (r.right > window.innerWidth) wrap.style.left = Math.max(8, window.innerWidth - r.width - 8) + "px";
    if (r.bottom > window.innerHeight) wrap.style.top = Math.max(8, window.innerHeight - r.height - 8) + "px";
    input.focus();
    const dot = (initial || "").lastIndexOf(".");
    input.setSelectionRange(0, dot > 0 ? dot : (initial || "").length);
    let done = false;
    const finish = v => { if (done) return; done = true; wrap.remove(); resolve(v); };
    input.addEventListener("keydown", e => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); finish(input.value.trim() || null); }
      else if (e.key === "Escape") { e.preventDefault(); finish(null); }
    });
    // Blur cancels (commit only on Enter) to avoid accidental renames/creates.
    input.addEventListener("blur", () => setTimeout(() => finish(null), 120));
  });
}

const api = () => (typeof window !== "undefined" ? window.api : undefined);
const dirname = p => { const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")); return i < 0 ? "" : p.slice(0, i); };
const basename = p => { const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")); return i < 0 ? p : p.slice(i + 1); };
const join = (dir, name) => (dir ? dir.replace(/[\\/]+$/, "") + "/" : "") + name;
const isAbs = p => /^([a-zA-Z]:[\\/]|[\\/])/.test(p);
// The tree uses project-relative paths; the fs-* IPC needs absolute ones.
// Resolve defensively (already-absolute paths pass through).
const toAbs = (ctx, p) => (isAbs(p) ? p : join(ctx.directory || "", p));

function hide() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
  document.removeEventListener("pointerdown", onDoc, true);
  document.removeEventListener("keydown", onKey, true);
}
function onDoc(e) { if (menuEl && !menuEl.contains(e.target)) hide(); }
function onKey(e) { if (e.key === "Escape") hide(); }

async function refresh(ctx, dir) { try { await ctx.refresh?.(dir); } catch (e) { console.error("[file-op] refresh", e); } }

async function newFile(dir, ctx) {
  const name = await promptInline("untitled.txt", "新規ファイル名");
  if (!name) return;
  const rel = join(dir, name);
  await api()?.fsNewFile?.(toAbs(ctx, rel));
  await refresh(ctx, dir);
  ctx.openFile?.(rel);
}
async function newFolder(dir, ctx) {
  const name = await promptInline("new-folder", "新規フォルダ名");
  if (!name) return;
  await api()?.fsMkdir?.(toAbs(ctx, join(dir, name)));
  await refresh(ctx, dir);
}
async function rename(node, ctx) {
  const cur = basename(node.path);
  const name = await promptInline(cur, "名前を変更");
  if (!name || name === cur) return;
  await api()?.fsRename?.(toAbs(ctx, node.path), toAbs(ctx, join(dirname(node.path), name)));
  await refresh(ctx, dirname(node.path));
}
async function del(node, ctx) {
  const choice = await confirmModal({
    title: "削除しますか？",
    message: node.path,
    buttons: [
      { id: "delete", label: "削除", variant: "danger" },
      { id: "cancel", label: "キャンセル", variant: "secondary" }
    ]
  });
  if (choice !== "delete") return;
  await api()?.fsDelete?.(toAbs(ctx, node.path));
  await refresh(ctx, dirname(node.path));
}
async function duplicate(node, ctx) {
  const dir = dirname(node.path), bn = basename(node.path);
  const dot = bn.lastIndexOf("."), stem = dot > 0 ? bn.slice(0, dot) : bn, ext = dot > 0 ? bn.slice(dot) : "";
  let rel = join(dir, stem + " copy" + ext), i = 2;
  while (await api()?.fsExists?.(toAbs(ctx, rel))) { rel = join(dir, stem + " copy " + i + ext); i++; }
  await api()?.fsCopy?.(toAbs(ctx, node.path), toAbs(ctx, rel));
  await refresh(ctx, dir);
}
async function paste(dir, ctx) {
  if (!clipboard) return;
  const name = basename(clipboard.path);
  let rel = join(dir, name);
  if (await api()?.fsExists?.(toAbs(ctx, rel))) rel = join(dir, "copy-" + name);
  if (clipboard.op === "cut") { await api()?.fsRename?.(toAbs(ctx, clipboard.path), toAbs(ctx, rel)); clipboard = null; }
  else { await api()?.fsCopy?.(toAbs(ctx, clipboard.path), toAbs(ctx, rel)); }
  await refresh(ctx, dir);
}

export function showFileContextMenu(node, event, ctx) {
  event.preventDefault();
  event.stopPropagation();
  lastXY = { x: event.clientX, y: event.clientY };
  hide();
  const isDir = node.type === "directory";
  const parent = dirname(node.path);
  const targetDir = isDir ? node.path : parent;
  const items = [
    // Open the file in the in-app editor (same action as double-clicking it).
    // Only for files; directories expand via the tree itself.
    ...(isDir ? [] : [
      { label: "開く", icon: "bi-file-earmark-text", run: () => ctx.openFile?.(node.path) },
      { divider: true },
    ]),
    { label: "新規ファイル", icon: "bi-file-earmark-plus", run: () => newFile(targetDir, ctx) },
    { label: "新規フォルダ", icon: "bi-folder-plus", run: () => newFolder(targetDir, ctx) },
    { divider: true },
    { label: "名前を変更", icon: "bi-pencil", run: () => rename(node, ctx) },
    { label: "複製", icon: "bi-files", run: () => duplicate(node, ctx) },
    { label: "削除", icon: "bi-trash text-danger", run: () => del(node, ctx) },
    { divider: true },
    { label: "コピー", icon: "bi-clipboard", run: () => { clipboard = { op: "copy", path: node.path }; } },
    { label: "切り取り", icon: "bi-scissors", run: () => { clipboard = { op: "cut", path: node.path }; } },
    { label: "貼り付け", icon: "bi-clipboard-check", disabled: !clipboard, run: () => paste(targetDir, ctx) },
    { divider: true },
    { label: "パスをコピー", icon: "bi-link-45deg", run: () => navigator.clipboard?.writeText(toAbs(ctx, node.path)) },
    { label: "ファイルの場所を開く", icon: "bi-box-arrow-up-right", run: () => api()?.openPath?.(toAbs(ctx, isDir ? node.path : parent)) },
  ];
  menuEl = document.createElement("div");
  menuEl.className = "dropdown-menu show";
  menuEl.style.cssText = "position:fixed;z-index:2000;display:block;min-width:200px;";
  for (const it of items) {
    if (it.divider) { const d = document.createElement("div"); d.className = "dropdown-divider"; menuEl.appendChild(d); continue; }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dropdown-item d-flex align-items-center gap-2 small" + (it.disabled ? " disabled" : "");
    b.innerHTML = `<i class="bi ${it.icon}"></i><span>${it.label}</span>`;
    if (!it.disabled) b.addEventListener("click", () => { hide(); Promise.resolve(it.run()).catch(err => console.error("[file-op]", err)); });
    menuEl.appendChild(b);
  }
  document.body.appendChild(menuEl);
  const r = menuEl.getBoundingClientRect();
  let x = event.clientX, y = event.clientY;
  if (x + r.width > window.innerWidth) x = Math.max(8, window.innerWidth - r.width - 8);
  if (y + r.height > window.innerHeight) y = Math.max(8, window.innerHeight - r.height - 8);
  menuEl.style.left = x + "px";
  menuEl.style.top = y + "px";
  document.addEventListener("pointerdown", onDoc, true);
  document.addEventListener("keydown", onKey, true);
}

// Run a named file operation, reusing the exact same logic as the right-click
// menu. The toolbar's file-op buttons call this with the active file as `node`
// (null when no file is open — only the project-relative newFile/newFolder run
// then, targeting the project root). ctx is the same shape the menu receives:
// { directory, refresh, openFile }.
export function runFileOp(op, node, ctx) {
  const isDir = node?.type === "directory";
  const baseDir = node ? (isDir ? node.path : dirname(node.path)) : "";
  switch (op) {
    case "newFile": return newFile(baseDir, ctx);
    case "newFolder": return newFolder(baseDir, ctx);
    case "rename": return node ? rename(node, ctx) : undefined;
    case "duplicate": return node ? duplicate(node, ctx) : undefined;
    case "delete": return node ? del(node, ctx) : undefined;
    case "copyPath": return node ? navigator.clipboard?.writeText(toAbs(ctx, node.path)) : undefined;
    case "openLocation": return node ? api()?.openPath?.(toAbs(ctx, isDir ? node.path : dirname(node.path))) : undefined;
    default: return undefined;
  }
}
