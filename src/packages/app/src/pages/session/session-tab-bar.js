// Bottom-pane header (top of the chat pane). Left: view tabs — currently just
// "チャット", with Output / Terminal / Debug to be added here later. Right:
// session controls — a select box to switch sessions, "+" to start a new one,
// and "×" to close (archive) the current one.
import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { For } from "solid-js";
import { sessionTitle } from "@/utils/session-title.js";

var _tmplBar = /*#__PURE__*/_$template(`<div data-component=session-tab-bar class="shrink-0 d-flex align-items-stretch bg-body-tertiary border-bottom" style="min-height:32px">`);
var _tmplViewTabs = /*#__PURE__*/_$template(`<div class="d-flex align-items-stretch">`);
var _tmplViewTab = /*#__PURE__*/_$template(`<button type=button class="btn btn-sm rounded-0 border-0 px-3 d-flex align-items-center small fw-medium text-decoration-none"></button>`);
var _tmplControls = /*#__PURE__*/_$template(`<div class="d-flex align-items-center gap-1 ms-auto px-2">`);
var _tmplSelect = /*#__PURE__*/_$template(`<select class="form-select form-select-sm w-auto" style="max-width:220px" title="セッションを切り替え" aria-label="セッションを切り替え">`);
var _tmplOption = /*#__PURE__*/_$template(`<option>`);
var _tmplNew = /*#__PURE__*/_$template(`<button type=button class="btn btn-sm btn-link p-0 px-1 text-secondary text-decoration-none" title="新しいセッション" aria-label="新しいセッション"><i class="bi bi-plus-lg">`);
var _tmplArchive = /*#__PURE__*/_$template(`<button type=button class="btn btn-sm btn-link p-0 px-1 text-secondary text-decoration-none" title="チャットペインを隠す" aria-label="チャットペインを隠す"><i class="bi bi-x-lg">`);

// View tabs of the bottom pane. Only "chat" is wired today; the others are
// placeholders for the upcoming output / terminal / debug roles.
const VIEW_TABS = [{ id: "chat", label: "チャット" }];

export function SessionTabBar(props) {
  return (() => {
    var _bar = _tmplBar();
    // --- Left: view tabs (Chat; Output / Terminal / Debug come here later) ---
    var _tabs = _tmplViewTabs();
    _$insert(_tabs, _$createComponent(For, {
      get each() {
        return VIEW_TABS;
      },
      children: tab => {
        var _t = _tmplViewTab();
        _t.textContent = tab.label;
        // Single active view for now; styled like the editor/session tabs.
        const active = tab.id === "chat";
        _t.classList.toggle("bg-body", active);
        _t.classList.toggle("text-body", active);
        _t.classList.toggle("text-secondary", !active);
        _t.style.borderBottom = active ? "2px solid var(--bs-primary)" : "2px solid transparent";
        return _t;
      }
    }), null);
    _$insert(_bar, _tabs, null);
    // --- Right: session controls (switch / new / close) ---
    var _ctrls = _tmplControls();
    var _sel = _tmplSelect();
    _$insert(_sel, _$createComponent(For, {
      get each() {
        return props.sessions?.() ?? [];
      },
      children: session => {
        var _o = _tmplOption();
        _o.value = session.id;
        _o.textContent = sessionTitle(session.title) || (session.id ? session.id.slice(0, 8) : "session");
        return _o;
      }
    }), null);
    _sel.addEventListener("change", () => {
      const s = (props.sessions?.() ?? []).find(x => x.id === _sel.value);
      if (s) props.onSelect?.(s);
    });
    // Keep the selected option in sync with the active session (re-run when the
    // session list loads so the value applies once its option exists).
    _$effect(() => {
      props.sessions?.();
      _sel.value = props.currentId?.() ?? "";
    });
    _$insert(_ctrls, _sel, null);
    var _new = _tmplNew();
    _new.addEventListener("click", () => props.onNew?.());
    _$insert(_ctrls, _new, null);
    var _arch = _tmplArchive();
    _arch.addEventListener("click", () => props.onClose?.());
    _$insert(_ctrls, _arch, null);
    _$insert(_bar, _ctrls, null);
    return _bar;
  })();
}
