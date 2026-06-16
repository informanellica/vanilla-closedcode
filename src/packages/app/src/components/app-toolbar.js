import { createComponent, createRenderEffect } from "../lib/reactivity.js";
import { IconButton } from "@/bs/icon-button.js";
import { Select } from "@/bs/select.js";
import { useSettings } from "@/context/settings.js";
import { useLanguage } from "@/context/language.js";

// Canonical list of every reorderable toolbar item (id + display label), in the
// built-in default order. The settings UI (settings-general.js) renders this so
// the user can reorder / hide items; AppToolbar builds the actual elements under
// the same ids and lays them out per settings.appearance.toolbarOrder(). Keep
// the ids here in sync with the add(...) calls in AppToolbar.
export const TOOLBAR_ITEMS = [
  { id: "home", label: "ホーム" },
  { id: "chat", label: "チャット" },
  { id: "openProject", label: "プロジェクトを開く" },
  { id: "newFile", label: "新規ファイル" },
  { id: "newFolder", label: "新規フォルダ" },
  { id: "rename", label: "名前を変更" },
  { id: "duplicate", label: "複製" },
  { id: "delete", label: "削除" },
  { id: "copyPath", label: "パスをコピー" },
  { id: "openLocation", label: "ファイルの場所を開く" },
  { id: "editMode", label: "編集モード切替" },
  { id: "font", label: "エディタのフォント" },
  { id: "fontSize", label: "文字サイズ" },
  { id: "save", label: "保存" },
  { id: "undo", label: "元に戻す" },
  { id: "redo", label: "やり直し" },
  { id: "cut", label: "切り取り" },
  { id: "copy", label: "コピー" },
  { id: "paste", label: "貼り付け" },
  { id: "layoutLeft", label: "左サイドバー" },
  { id: "layoutRight", label: "右サイドバー" },
  { id: "spacer", label: "スペーサー（以降を右寄せ）" },
  { id: "search", label: "検索・置換" },
  { id: "language", label: "言語" },
  { id: "theme", label: "テーマ切替" },
  { id: "settings", label: "設定" },
  { id: "help", label: "ヘルプ" }
];
export const DEFAULT_TOOLBAR_ORDER = TOOLBAR_ITEMS.map(it => it.id);

// Parse a static HTML string into its root element. Only static markup goes
// through here; dynamic text is assigned via textContent/properties.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

// The vanilla Select reads its controlled `current` prop once at build time,
// so push external changes (settings dialog, commands) into the native select
// in an effect or it goes stale. Self-driven picks round-trip through the
// store unchanged, so this never fights the user's selection.
function trackSelectValue(select, value) {
  createRenderEffect(() => {
    select.value = value();
    // Unknown value (e.g. a custom font typed in the settings dialog): fall
    // back to the first option, matching the Select's build-time behavior.
    if (select.selectedIndex < 0) select.selectedIndex = 0;
  });
}

// Light/Dark toggle button in the toolbar. The icon shows the current theme
// (sun = light, moon = dark) and clicking flips to the other one.
function ThemeToggle(props) {
  const btn = template(`<button type="button" class="btn btn-link btn-sm d-inline-flex align-items-center justify-content-center" title="ライト/ダーク切替" aria-label="ライト/ダーク切替"><i class="bi"></i></button>`);
  const icon = btn.firstChild;
  const isDark = () => {
    const cur = props.colorScheme?.() ?? "system";
    // Explicit light/dark wins; for "system" fall back to the applied theme.
    return cur === "dark" || cur !== "light" && document.documentElement.getAttribute("data-bs-theme") === "dark";
  };
  btn.addEventListener("click", () => props.onSetTheme?.(isDark() ? "light" : "dark"));
  createRenderEffect(() => {
    icon.className = "bi " + (isDark() ? "bi-moon-stars-fill" : "bi-sun-fill");
  });
  return btn;
}

// View/Edit toggle for the active file editor. Hidden when no editable file is
// open. The icon reflects the CURRENT mode (eye = viewing, pencil = editing);
// the tooltip describes what a click does.
function EditModeToggle(props) {
  const btn = template(`<button type="button" class="btn btn-link btn-sm d-inline-flex align-items-center justify-content-center"><i class="bi"></i></button>`);
  const icon = btn.firstChild;
  btn.addEventListener("click", () => props.onToggleEdit?.());
  createRenderEffect(() => {
    const can = !!props.editorCanEdit?.();
    const editing = !!props.editorEditing?.();
    btn.style.display = can ? "" : "none";
    icon.className = "bi " + (editing ? "bi-pencil-square" : "bi-file-earmark-lock");
    const label = editing ? "閲覧モードに戻す" : "このファイルを編集";
    btn.title = label;
    btn.setAttribute("aria-label", label);
  });
  return btn;
}

// Save button for the active file editor. Visible while editing; enabled (and
// highlighted) only when there are unsaved changes.
function SaveButton(props) {
  const btn = template(`<button type="button" class="btn btn-link btn-sm d-inline-flex align-items-center justify-content-center" title="保存" aria-label="保存"><i class="bi bi-floppy"></i></button>`);
  btn.addEventListener("click", () => {
    if (props.editorDirty?.()) props.onSave?.();
  });
  createRenderEffect(() => {
    const editing = !!props.editorEditing?.();
    const dirty = !!props.editorDirty?.();
    btn.style.display = editing ? "" : "none";
    btn.disabled = !dirty;
    btn.classList.toggle("text-primary", dirty);
    btn.classList.toggle("text-secondary", !dirty);
  });
  return btn;
}

// VS Code-style find/replace widget for the active editor. Operates directly on
// the visible CodeMirror instance (found via the DOM — only one editor is
// visible at a time), so it needs no plumbing. Find input with case/word/regex
// toggles, a match counter, prev/next, a replace toggle, and a clear button.
// Shown only when an editable file is open. Enter = next, Shift+Enter = prev.
function EditorSearchBox(props) {
  const activeCM = () =>
    document.querySelector('[data-slot="tabs-content"]:not(.d-none) .CodeMirror')?.CodeMirror ||
    document.querySelector(".vide-host .CodeMirror")?.CodeMirror ||
    null;
  const opt = { caseSensitive: false, word: false, regex: false };
  const wrap = template(`<div class="d-flex align-items-center gap-1 border rounded px-1 bg-body" data-slot="editor-search"><div class="position-relative d-flex align-items-center"><input data-op="q" type="text" class="form-control form-control-sm" placeholder="検索" style="width:150px;height:26px;padding-right:62px"><span class="position-absolute d-flex align-items-center" style="right:4px;top:50%;transform:translateY(-50%);gap:1px"><button data-op="case" type="button" class="btn btn-sm py-0 px-1 text-secondary" title="大文字と小文字を区別する" style="font-size:11px;line-height:1.4">Aa</button><button data-op="word" type="button" class="btn btn-sm py-0 px-1 text-secondary" title="単語単位で検索する" style="font-size:11px;line-height:1.4">ab</button><button data-op="regex" type="button" class="btn btn-sm py-0 px-1 text-secondary" title="正規表現を使用する" style="font-size:11px;line-height:1.4">.*</button></span></div><span data-op="count" class="small text-secondary text-nowrap text-center" style="min-width:52px"></span><button data-op="prev" type="button" class="btn btn-link btn-sm p-1 d-inline-flex" title="前の一致 (Shift+Enter)"><i class="bi bi-chevron-up"></i></button><button data-op="next" type="button" class="btn btn-link btn-sm p-1 d-inline-flex" title="次の一致 (Enter)"><i class="bi bi-chevron-down"></i></button><button data-op="toggle-replace" type="button" class="btn btn-link btn-sm p-1 d-inline-flex" title="置換の切り替え"><i class="bi bi-list"></i></button><div data-op="rwrap" class="d-flex align-items-center gap-1" style="display:none"><input data-op="r" type="text" class="form-control form-control-sm" placeholder="置換" style="width:150px;height:26px"><button data-op="rep" type="button" class="btn btn-link btn-sm p-1 d-inline-flex" title="置換 (Enter)"><i class="bi bi-arrow-return-left"></i></button><button data-op="repall" type="button" class="btn btn-link btn-sm p-1 d-inline-flex" title="すべて置換"><i class="bi bi-arrow-repeat"></i></button></div><button data-op="close" type="button" class="btn btn-link btn-sm p-1 d-inline-flex" title="クリア (Esc)"><i class="bi bi-x-lg"></i></button></div>`);
  const q = wrap.querySelector('[data-op="q"]');
  const r = wrap.querySelector('[data-op="r"]');
  const countEl = wrap.querySelector('[data-op="count"]');
  const rwrap = wrap.querySelector('[data-op="rwrap"]');
  let matches = [];
  let cur = -1;
  const escapeRe = sx => sx.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const buildRegex = query => {
    let pattern = opt.regex ? query : escapeRe(query);
    if (opt.word) pattern = "\\b" + pattern + "\\b";
    try { return new RegExp(pattern, opt.caseSensitive ? "g" : "gi"); } catch (e) { return null; }
  };
  const updateCount = () => {
    if (!q.value) { countEl.textContent = ""; return; }
    if (!matches.length) { countEl.textContent = "結果なし"; return; }
    countEl.textContent = (cur >= 0 ? cur + 1 : 0) + " / " + matches.length;
  };
  const recompute = () => {
    const cm = activeCM();
    matches = [];
    const query = q.value;
    if (cm && query) {
      const re = buildRegex(query);
      if (re) {
        const text = cm.getValue();
        let m;
        while ((m = re.exec(text)) !== null) {
          matches.push([m.index, m.index + m[0].length]);
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      }
    }
    if (cur >= matches.length) cur = matches.length - 1;
    updateCount();
  };
  const select = idx => {
    const cm = activeCM();
    if (!cm || !matches.length) return;
    cur = ((idx % matches.length) + matches.length) % matches.length;
    const m = matches[cur];
    cm.setSelection(cm.posFromIndex(m[0]), cm.posFromIndex(m[1]));
    cm.scrollIntoView(null, 60);
    updateCount();
  };
  const find = forward => {
    const cm = activeCM();
    if (!cm) return;
    recompute();
    if (!matches.length) return;
    const anchor = cm.indexFromPos(cm.getCursor(forward ? "to" : "from"));
    let idx;
    if (forward) {
      idx = matches.findIndex(m => m[0] >= anchor);
      if (idx < 0) idx = 0;
    } else {
      idx = -1;
      for (let k = matches.length - 1; k >= 0; k--) { if (matches[k][0] < anchor) { idx = k; break; } }
      if (idx < 0) idx = matches.length - 1;
    }
    select(idx);
  };
  const replaceOne = () => {
    const cm = activeCM();
    if (!cm || !q.value) return;
    recompute();
    if (!matches.length) return;
    const selFrom = cm.indexFromPos(cm.getCursor("from"));
    const selTo = cm.indexFromPos(cm.getCursor("to"));
    if (!matches.some(m => m[0] === selFrom && m[1] === selTo)) { find(true); return; }
    cm.replaceSelection(r.value);
    recompute();
    if (matches.length) {
      const at = cm.indexFromPos(cm.getCursor("to"));
      const next = matches.findIndex(m => m[0] >= at);
      select(next < 0 ? 0 : next);
    }
  };
  const replaceAll = () => {
    const cm = activeCM();
    if (!cm || !q.value) return;
    const re = buildRegex(q.value);
    if (!re) return;
    cm.setValue(cm.getValue().replace(re, r.value));
    recompute();
  };
  const clear = () => {
    q.value = "";
    r.value = "";
    matches = [];
    cur = -1;
    updateCount();
    const cm = activeCM();
    if (cm) cm.focus();
  };
  const setOpt = (name, btn) => {
    opt[name] = !opt[name];
    btn.classList.toggle("bg-primary", opt[name]);
    btn.classList.toggle("text-white", opt[name]);
    btn.classList.toggle("rounded", opt[name]);
    btn.classList.toggle("text-secondary", !opt[name]);
    cur = -1;
    recompute();
  };
  q.addEventListener("input", () => { cur = -1; recompute(); });
  q.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); find(!e.shiftKey); }
    else if (e.key === "Escape") { e.preventDefault(); clear(); }
  });
  r.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); replaceOne(); } });
  wrap.querySelector('[data-op="prev"]').addEventListener("click", () => find(false));
  wrap.querySelector('[data-op="next"]').addEventListener("click", () => find(true));
  wrap.querySelector('[data-op="rep"]').addEventListener("click", replaceOne);
  wrap.querySelector('[data-op="repall"]').addEventListener("click", replaceAll);
  wrap.querySelector('[data-op="case"]').addEventListener("click", e => setOpt("caseSensitive", e.currentTarget));
  wrap.querySelector('[data-op="word"]').addEventListener("click", e => setOpt("word", e.currentTarget));
  wrap.querySelector('[data-op="regex"]').addEventListener("click", e => setOpt("regex", e.currentTarget));
  wrap.querySelector('[data-op="toggle-replace"]').addEventListener("click", () => {
    rwrap.style.display = rwrap.style.display === "none" ? "" : "none";
    if (rwrap.style.display !== "none") r.focus();
  });
  wrap.querySelector('[data-op="close"]').addEventListener("click", clear);
  createRenderEffect(() => {
    wrap.style.display = props.editorCanEdit?.() ? "" : "none";
  });
  return wrap;
}

// One reorderable file-op button (mirrors the explorer right-click menu). The
// toolbar lacks file-tree context, so a click dispatches a vcc:fileop window
// event handled by the session page, acting on the active file.
function fileOpButton(icon, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn-link btn-sm d-inline-flex align-items-center justify-content-center";
  b.title = title;
  b.setAttribute("aria-label", title);
  const ic = document.createElement("i");
  ic.className = "bi " + icon;
  b.appendChild(ic);
  return b;
}

export function AppToolbar(props) {
  // Single flat flex container. Every item is laid out directly into it in the
  // user-chosen order (settings.appearance.toolbarOrder), so there are no fixed
  // sub-groups — the order/visibility of all icons is fully customizable.
  const root = template(`<div class="btn-toolbar gap-1 align-items-center flex-grow-1" role="toolbar"></div>`);
  const settings = useSettings();
  const language = useLanguage();

  // Build every item once, keyed by id. add() registers the element; the layout
  // effect below reparents them into `root` per the persisted order.
  const byId = new Map();
  const add = (id, el) => {
    // Tag each element with its toolbar id so layout/order is inspectable
    // (and queryable) from the DOM.
    if (el && el.setAttribute) el.setAttribute("data-tb-id", id);
    byId.set(id, el);
    return el;
  };

  add("home", createComponent(IconButton, {
    icon: "home",
    variant: "ghost",
    title: "ホーム",
    "aria-label": "ホーム",
    onClick: () => props.onHome?.()
  }));
  add("chat", createComponent(IconButton, {
    icon: "new-session",
    variant: "ghost",
    title: "チャット（下ペインを開く）",
    "aria-label": "チャット",
    onClick: () => props.onOpenChat?.()
  }));
  add("openProject", createComponent(IconButton, {
    icon: "folder-add-left",
    variant: "ghost",
    title: "プロジェクトを開く",
    "aria-label": "プロジェクトを開く",
    onClick: () => props.onOpenProject?.()
  }));
  // (No "server" button: the local-only build has no remote server to connect
  // to, the "server" sprite icon doesn't exist (rendered blank), and openServer
  // remains reachable from the command menu. Removed from the toolbar + the
  // customizer.)

  // File operations (each individually reorderable). Clicks dispatch vcc:fileop.
  const fileOp = (id, icon, title, op) => {
    const b = fileOpButton(icon, title);
    b.addEventListener("click", () => {
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("vcc:fileop", { detail: { op } }));
    });
    add(id, b);
  };
  fileOp("newFile", "bi-file-earmark-plus", "新規ファイル", "newFile");
  fileOp("newFolder", "bi-folder-plus", "新規フォルダ", "newFolder");
  fileOp("rename", "bi-pencil", "名前を変更", "rename");
  fileOp("duplicate", "bi-files", "複製", "duplicate");
  fileOp("delete", "bi-trash text-danger", "削除", "delete");
  fileOp("copyPath", "bi-link-45deg", "パスをコピー", "copyPath");
  fileOp("openLocation", "bi-box-arrow-up-right", "ファイルの場所を開く", "openLocation");

  add("editMode", createComponent(EditModeToggle, {
    get editorCanEdit() {
      return props.editorCanEdit;
    },
    get editorEditing() {
      return props.editorEditing;
    },
    get onToggleEdit() {
      return props.onToggleEdit;
    }
  }));
  // Editor font family / size selects. They write straight to the settings
  // store; settings.js applies them via --font-family-mono/--editor-font-size.
  const EDITOR_FONTS = ["", "Consolas", "Cascadia Code", "JetBrains Mono", "Source Code Pro", "Noto Sans Mono", "MS Gothic"];
  const EDITOR_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22];
  const fontSelect = createComponent(Select, {
    options: EDITOR_FONTS,
    get current() {
      return settings.appearance.font();
    },
    label: f => f === "" ? "Consolas (default)" : f, // monoFallback resolves to Consolas on Windows
    value: f => f,
    onSelect: f => settings.appearance.setFont(f ?? ""),
    variant: "ghost",
    size: "small",
    title: "エディタのフォント"
  });
  trackSelectValue(fontSelect, () => settings.appearance.font() ?? "");
  add("font", fontSelect);
  const sizeSelect = createComponent(Select, {
    options: EDITOR_SIZES,
    get current() {
      return settings.appearance.fontSize();
    },
    label: n => `${n}px`,
    value: n => String(n),
    onSelect: n => n != null && settings.appearance.setFontSize(Number(n)),
    variant: "ghost",
    size: "small",
    title: "エディタの文字サイズ"
  });
  trackSelectValue(sizeSelect, () => String(settings.appearance.fontSize()));
  add("fontSize", sizeSelect);
  add("save", createComponent(SaveButton, {
    get editorEditing() {
      return props.editorEditing;
    },
    get editorDirty() {
      return props.editorDirty;
    },
    get onSave() {
      return props.onSave;
    }
  }));
  add("undo", createComponent(IconButton, {
    icon: "arrow-counterclockwise",
    variant: "ghost",
    title: "元に戻す",
    "aria-label": "元に戻す",
    onClick: () => props.onUndo?.()
  }));
  add("redo", createComponent(IconButton, {
    icon: "arrow-clockwise",
    variant: "ghost",
    title: "やり直し",
    "aria-label": "やり直し",
    onClick: () => props.onRedo?.()
  }));
  add("cut", createComponent(IconButton, {
    icon: "scissors",
    variant: "ghost",
    title: "切り取り",
    "aria-label": "切り取り",
    onClick: () => props.onCut?.()
  }));
  add("copy", createComponent(IconButton, {
    icon: "copy",
    variant: "ghost",
    title: "コピー",
    "aria-label": "コピー",
    onClick: () => props.onCopy?.()
  }));
  add("paste", createComponent(IconButton, {
    icon: "clipboard",
    variant: "ghost",
    title: "貼り付け",
    "aria-label": "貼り付け",
    onClick: () => props.onPaste?.()
  }));
  add("layoutLeft", createComponent(IconButton, {
    icon: "layout-left",
    variant: "ghost",
    title: "左サイドバー（エクスプローラー）",
    "aria-label": "左サイドバー切り替え",
    onClick: () => props.onToggleFileTree?.()
  }));
  add("layoutRight", createComponent(IconButton, {
    icon: "layout-right",
    variant: "ghost",
    title: "右サイドバー（変更）",
    "aria-label": "右サイドバー切り替え",
    onClick: () => props.onToggleReviewPanel?.()
  }));

  // Flex spacer: everything after it is pushed to the right edge (replaces the
  // old ms-auto right group). Reorderable like any other item.
  const spacer = document.createElement("div");
  spacer.className = "flex-grow-1";
  spacer.setAttribute("data-tb-spacer", "");
  add("spacer", spacer);

  // Editor find/replace box.
  add("search", createComponent(EditorSearchBox, {
    get editorCanEdit() {
      return props.editorCanEdit;
    }
  }));
  // UI language switcher: compact native select showing the locale code
  // (JA/EN/…); switching re-renders all reactive i18n text live.
  const langSelect = createComponent(Select, {
    get options() {
      return language.locales;
    },
    get current() {
      return language.locale();
    },
    label: locale => locale.toUpperCase(),
    value: locale => locale,
    onSelect: locale => locale && language.setLocale(locale),
    variant: "ghost",
    size: "small",
    "class": "ms-1",
    get title() {
      return language.t("settings.general.language") ?? "Language";
    }
  });
  trackSelectValue(langSelect, () => language.locale());
  // The Select applies `title` once at build; keep the tooltip in the live
  // locale like every other reactive i18n string.
  createRenderEffect(() => {
    langSelect.title = language.t("settings.general.language") ?? "Language";
  });
  add("language", langSelect);
  add("theme", createComponent(ThemeToggle, {
    get colorScheme() {
      return props.colorScheme;
    },
    get onSetTheme() {
      return props.onSetTheme;
    }
  }));
  add("settings", createComponent(IconButton, {
    icon: "settings-gear",
    variant: "ghost",
    title: "設定",
    "aria-label": "設定",
    onClick: () => props.onOpenSettings?.()
  }));
  add("help", createComponent(IconButton, {
    icon: "help",
    variant: "ghost",
    title: "ヘルプ",
    "aria-label": "ヘルプ",
    onClick: () => props.onHelp?.()
  }));

  // Lay out the items into `root` per the persisted order: saved ids first
  // (deduped, only known ids), then any default ids not yet placed (so newly
  // added toolbar items appear without the user having to re-save). Hidden ids
  // are detached. Reactive on toolbarOrder()/toolbarHidden() — reordering or
  // toggling visibility in settings re-runs this immediately. appendChild on an
  // element already in `root` moves it to the end, so iterating in order yields
  // the final order.
  const renderToolbar = () => {
    const saved = settings.appearance.toolbarOrder?.() ?? [];
    const hidden = new Set(settings.appearance.toolbarHidden?.() ?? []);
    const seen = new Set();
    const order = [];
    for (const id of saved) {
      if (byId.has(id) && !seen.has(id)) { order.push(id); seen.add(id); }
    }
    for (const id of DEFAULT_TOOLBAR_ORDER) {
      if (byId.has(id) && !seen.has(id)) { order.push(id); seen.add(id); }
    }
    for (const id of order) {
      const el = byId.get(id);
      if (hidden.has(id)) {
        if (el.parentNode === root) root.removeChild(el);
      } else {
        root.appendChild(el);
      }
    }
  };
  createRenderEffect(renderToolbar);
  return root;
}
