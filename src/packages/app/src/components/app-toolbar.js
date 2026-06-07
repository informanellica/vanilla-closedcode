import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="btn-toolbar gap-1 align-items-center flex-grow-1" role=toolbar><div class="btn-group" role=group></div><div class="vr mx-1 align-self-center" style="height:18px"></div><div class="btn-group" role=group></div><div class="vr mx-1 align-self-center" style="height:18px"></div><div class="btn-group" role=group></div><div class="btn-group ms-auto" role=group>`);
var _tmplTheme = /*#__PURE__*/_$template(`<button type="button" class="btn btn-link btn-sm d-inline-flex align-items-center justify-content-center" title="ライト/ダーク切替" aria-label="ライト/ダーク切替"><i class="bi"></i></button>`);
var _tmplEditToggle = /*#__PURE__*/_$template(`<button type="button" class="btn btn-link btn-sm d-inline-flex align-items-center justify-content-center"><i class="bi"></i></button>`);
var _tmplSave = /*#__PURE__*/_$template(`<button type="button" class="btn btn-link btn-sm d-inline-flex align-items-center justify-content-center" title="保存" aria-label="保存"><i class="bi bi-floppy"></i></button>`);
import { IconButton } from "@/bs/icon-button.js";
// Light/Dark toggle button in the toolbar. The icon shows the current theme
// (sun = light, moon = dark) and clicking flips to the other one.
function ThemeToggle(props) {
  var _btn = _tmplTheme();
  var _icon = _btn.firstChild;
  const isDark = () => {
    const cur = props.colorScheme?.() ?? "system";
    // Explicit light/dark wins; for "system" fall back to the applied theme.
    return cur === "dark" || cur !== "light" && document.documentElement.getAttribute("data-bs-theme") === "dark";
  };
  _btn.addEventListener("click", () => props.onSetTheme?.(isDark() ? "light" : "dark"));
  _$effect(() => {
    _icon.className = "bi " + (isDark() ? "bi-moon-stars-fill" : "bi-sun-fill");
  });
  return _btn;
}
// View/Edit toggle for the active file editor. Hidden when no editable file is
// open. The icon reflects the CURRENT mode (eye = viewing, pencil = editing);
// the tooltip describes what a click does.
function EditModeToggle(props) {
  var _btn = _tmplEditToggle();
  var _icon = _btn.firstChild;
  _btn.addEventListener("click", () => props.onToggleEdit?.());
  _$effect(() => {
    const can = !!props.editorCanEdit?.();
    const editing = !!props.editorEditing?.();
    _btn.style.display = can ? "" : "none";
    _icon.className = "bi " + (editing ? "bi-pencil-square" : "bi-eye");
    const label = editing ? "閲覧モードに戻す" : "このファイルを編集";
    _btn.title = label;
    _btn.setAttribute("aria-label", label);
  });
  return _btn;
}
// Save button for the active file editor. Visible while editing; enabled (and
// highlighted) only when there are unsaved changes.
function SaveButton(props) {
  var _btn = _tmplSave();
  _btn.addEventListener("click", () => {
    if (props.editorDirty?.()) props.onSave?.();
  });
  _$effect(() => {
    const editing = !!props.editorEditing?.();
    const dirty = !!props.editorDirty?.();
    _btn.style.display = editing ? "" : "none";
    _btn.disabled = !dirty;
    _btn.classList.toggle("text-primary", dirty);
    _btn.classList.toggle("text-secondary", !dirty);
  });
  return _btn;
}
export function AppToolbar(props) {
  return (() => {
    var _el$ = _tmpl$(),
      _group = _el$.firstChild,
      _editGroup = _group.nextSibling.nextSibling,
      _paneGroup = _editGroup.nextSibling.nextSibling,
      _rightGroup = _paneGroup.nextSibling;
    // Home button: navigate to the no-project home ("/") unconditionally. Open
    // projects stay in the list — this only changes the route, it does not close
    // or remove anything.
    _$insert(_group, _$createComponent(IconButton, {
      icon: "home",
      variant: "ghost",
      title: "ホーム",
      "aria-label": "ホーム",
      onClick: () => props.onHome?.()
    }), null);
    // Chat-bubble button opens the bottom chat pane. (New sessions are created
    // from the "+" in the session tab bar, so no dedicated new-session button.)
    _$insert(_group, _$createComponent(IconButton, {
      icon: "new-session",
      variant: "ghost",
      title: "チャット（下ペインを開く）",
      "aria-label": "チャット",
      onClick: () => props.onOpenChat?.()
    }), null);
    _$insert(_group, _$createComponent(IconButton, {
      icon: "folder-add-left",
      variant: "ghost",
      title: "プロジェクトを開く",
      "aria-label": "プロジェクトを開く",
      onClick: () => props.onOpenProject?.()
    }), null);
    _$insert(_group, _$createComponent(IconButton, {
      icon: "server",
      variant: "ghost",
      title: "サーバー",
      "aria-label": "サーバー",
      onClick: () => props.onOpenServer?.()
    }), null);
    _$insert(_editGroup, _$createComponent(EditModeToggle, {
      get editorCanEdit() {
        return props.editorCanEdit;
      },
      get editorEditing() {
        return props.editorEditing;
      },
      get onToggleEdit() {
        return props.onToggleEdit;
      }
    }), null);
    _$insert(_editGroup, _$createComponent(SaveButton, {
      get editorEditing() {
        return props.editorEditing;
      },
      get editorDirty() {
        return props.editorDirty;
      },
      get onSave() {
        return props.onSave;
      }
    }), null);
    _$insert(_editGroup, _$createComponent(IconButton, {
      icon: "arrow-counterclockwise",
      variant: "ghost",
      title: "元に戻す",
      "aria-label": "元に戻す",
      onClick: () => props.onUndo?.()
    }), null);
    _$insert(_editGroup, _$createComponent(IconButton, {
      icon: "arrow-clockwise",
      variant: "ghost",
      title: "やり直し",
      "aria-label": "やり直し",
      onClick: () => props.onRedo?.()
    }), null);
    _$insert(_editGroup, _$createComponent(IconButton, {
      icon: "scissors",
      variant: "ghost",
      title: "切り取り",
      "aria-label": "切り取り",
      onClick: () => props.onCut?.()
    }), null);
    _$insert(_editGroup, _$createComponent(IconButton, {
      icon: "copy",
      variant: "ghost",
      title: "コピー",
      "aria-label": "コピー",
      onClick: () => props.onCopy?.()
    }), null);
    _$insert(_editGroup, _$createComponent(IconButton, {
      icon: "clipboard",
      variant: "ghost",
      title: "貼り付け",
      "aria-label": "貼り付け",
      onClick: () => props.onPaste?.()
    }), null);
    _$insert(_paneGroup, _$createComponent(IconButton, {
      icon: "layout-left",
      variant: "ghost",
      title: "左サイドバー（エクスプローラー）",
      "aria-label": "左サイドバー切り替え",
      onClick: () => props.onToggleFileTree?.()
    }), null);
    _$insert(_paneGroup, _$createComponent(IconButton, {
      icon: "layout-right",
      variant: "ghost",
      title: "右サイドバー（変更）",
      "aria-label": "右サイドバー切り替え",
      onClick: () => props.onToggleReviewPanel?.()
    }), null);
    // Far-right group (ms-auto): Help, Settings, Light/Dark.
    _$insert(_rightGroup, _$createComponent(IconButton, {
      icon: "help",
      variant: "ghost",
      title: "ヘルプ",
      "aria-label": "ヘルプ",
      onClick: () => props.onHelp?.()
    }), null);
    _$insert(_rightGroup, _$createComponent(IconButton, {
      icon: "settings-gear",
      variant: "ghost",
      title: "設定",
      "aria-label": "設定",
      onClick: () => props.onOpenSettings?.()
    }), null);
    _$insert(_rightGroup, _$createComponent(ThemeToggle, {
      get colorScheme() {
        return props.colorScheme;
      },
      get onSetTheme() {
        return props.onSetTheme;
      }
    }), null);
    return _el$;
  })();
}
