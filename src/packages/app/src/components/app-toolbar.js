import { createComponent, createRenderEffect } from "../lib/reactivity.js";
import { IconButton } from "@/bs/icon-button.js";
import { Select } from "@/bs/select.js";
import { useSettings } from "@/context/settings.js";
import { useLanguage } from "@/context/language.js";

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

export function AppToolbar(props) {
  const root = template(`
    <div class="btn-toolbar gap-1 align-items-center flex-grow-1" role="toolbar">
      <div class="btn-group" role="group" data-slot="main"></div>
      <div class="vr mx-1 align-self-center" style="height:18px"></div>
      <div class="btn-group" role="group" data-slot="edit"></div>
      <div class="vr mx-1 align-self-center" style="height:18px"></div>
      <div class="btn-group" role="group" data-slot="pane"></div>
      <div class="btn-group ms-auto" role="group" data-slot="right"></div>
    </div>`);
  const group = root.querySelector('[data-slot="main"]');
  const editGroup = root.querySelector('[data-slot="edit"]');
  const paneGroup = root.querySelector('[data-slot="pane"]');
  const rightGroup = root.querySelector('[data-slot="right"]');

  // Home button: navigate to the no-project home ("/") unconditionally. Open
  // projects stay in the list — this only changes the route, it does not close
  // or remove anything.
  group.appendChild(createComponent(IconButton, {
    icon: "home",
    variant: "ghost",
    title: "ホーム",
    "aria-label": "ホーム",
    onClick: () => props.onHome?.()
  }));
  // Chat-bubble button opens the bottom chat pane. (New sessions are created
  // from the "+" in the session tab bar, so no dedicated new-session button.)
  group.appendChild(createComponent(IconButton, {
    icon: "new-session",
    variant: "ghost",
    title: "チャット（下ペインを開く）",
    "aria-label": "チャット",
    onClick: () => props.onOpenChat?.()
  }));
  group.appendChild(createComponent(IconButton, {
    icon: "folder-add-left",
    variant: "ghost",
    title: "プロジェクトを開く",
    "aria-label": "プロジェクトを開く",
    onClick: () => props.onOpenProject?.()
  }));
  group.appendChild(createComponent(IconButton, {
    icon: "server",
    variant: "ghost",
    title: "サーバー",
    "aria-label": "サーバー",
    onClick: () => props.onOpenServer?.()
  }));

  editGroup.appendChild(createComponent(EditModeToggle, {
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
  const settings = useSettings();
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
  editGroup.appendChild(fontSelect);
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
  editGroup.appendChild(sizeSelect);
  editGroup.appendChild(createComponent(SaveButton, {
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
  editGroup.appendChild(createComponent(IconButton, {
    icon: "arrow-counterclockwise",
    variant: "ghost",
    title: "元に戻す",
    "aria-label": "元に戻す",
    onClick: () => props.onUndo?.()
  }));
  editGroup.appendChild(createComponent(IconButton, {
    icon: "arrow-clockwise",
    variant: "ghost",
    title: "やり直し",
    "aria-label": "やり直し",
    onClick: () => props.onRedo?.()
  }));
  editGroup.appendChild(createComponent(IconButton, {
    icon: "scissors",
    variant: "ghost",
    title: "切り取り",
    "aria-label": "切り取り",
    onClick: () => props.onCut?.()
  }));
  editGroup.appendChild(createComponent(IconButton, {
    icon: "copy",
    variant: "ghost",
    title: "コピー",
    "aria-label": "コピー",
    onClick: () => props.onCopy?.()
  }));
  editGroup.appendChild(createComponent(IconButton, {
    icon: "clipboard",
    variant: "ghost",
    title: "貼り付け",
    "aria-label": "貼り付け",
    onClick: () => props.onPaste?.()
  }));

  paneGroup.appendChild(createComponent(IconButton, {
    icon: "layout-left",
    variant: "ghost",
    title: "左サイドバー（エクスプローラー）",
    "aria-label": "左サイドバー切り替え",
    onClick: () => props.onToggleFileTree?.()
  }));
  paneGroup.appendChild(createComponent(IconButton, {
    icon: "layout-right",
    variant: "ghost",
    title: "右サイドバー（変更）",
    "aria-label": "右サイドバー切り替え",
    onClick: () => props.onToggleReviewPanel?.()
  }));

  // Far-right group (ms-auto): Language, Light/Dark, Settings, Help.
  // UI language switcher (far right): compact native select showing the
  // locale code (JA/EN/…); switching re-renders all reactive i18n text live.
  const language = useLanguage();
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
  rightGroup.appendChild(langSelect);
  rightGroup.appendChild(createComponent(ThemeToggle, {
    get colorScheme() {
      return props.colorScheme;
    },
    get onSetTheme() {
      return props.onSetTheme;
    }
  }));
  rightGroup.appendChild(createComponent(IconButton, {
    icon: "settings-gear",
    variant: "ghost",
    title: "設定",
    "aria-label": "設定",
    onClick: () => props.onOpenSettings?.()
  }));
  rightGroup.appendChild(createComponent(IconButton, {
    icon: "help",
    variant: "ghost",
    title: "ヘルプ",
    "aria-label": "ヘルプ",
    onClick: () => props.onHelp?.()
  }));
  return root;
}
