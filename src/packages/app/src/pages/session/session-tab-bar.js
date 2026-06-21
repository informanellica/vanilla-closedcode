/** @file Bottom-pane chat header bar. Left: one TAB per open session (name + inline rename + close), like editor tabs; "+" opens a new session as a new tab. Right: a clock-history button that pops up a dropdown list of ALL sessions to open, plus the pane-close button. */
import { createRenderEffect, createSignal, onCleanup } from "../../lib/reactivity.js";
import { sessionTitle } from "@/utils/session-title.js";

const NEW_TAB_LABEL = "新規セッション";
const POPUP_STYLE_ID = "cc-session-popup-style";

/**
 * Inject (once) the stylesheet rule that reveals each popup row's edit/delete
 * icons on hover / keyboard focus, using opacity (not visibility) so they stay
 * hit-testable.
 * @returns {void}
 */
function ensurePopupStyle() {
  if (typeof document === "undefined" || document.getElementById(POPUP_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = POPUP_STYLE_ID;
  style.textContent =
    '[data-slot="session-popup-row"] .cc-popup-action{opacity:0;transition:opacity .1s}' +
    '[data-slot="session-popup-row"]:hover .cc-popup-action,' +
    '[data-slot="session-popup-row"] .cc-popup-action:focus{opacity:1}';
  document.head.appendChild(style);
}

// Outer CATEGORY tabs (tabs-within-tabs): the chat pane currently has one
// category ("チャット") that contains the session tabs; future categories
// (e.g. ターミナル) slot in here alongside it.
const CATEGORIES = [{ id: "chat", label: "チャット", icon: "bi-chat-dots" }];

// Static skeleton; dynamic parts hook in via [data-slot] placeholders. The bar
// is two stacked rows: a category-tab strip on top, the session-tab strip below.
const BAR_HTML = `
  <div data-component="session-tab-bar" class="position-relative shrink-0 d-flex flex-column bg-body-tertiary border-bottom">
    <div data-slot="category-tabs" class="d-flex align-items-stretch border-bottom overflow-x-auto" style="min-height:28px"></div>
    <div data-slot="session-row" class="d-flex align-items-stretch min-w-0" style="min-height:32px">
      <div data-slot="session-tabs" class="d-flex align-items-stretch overflow-x-auto min-w-0"></div>
      <button data-slot="session-new" type="button" class="btn btn-sm btn-link p-0 px-2 text-secondary text-decoration-none shrink-0" title="新しいセッション" aria-label="新しいセッション"><i class="bi bi-plus-lg"></i></button>
      <div data-slot="controls" class="d-flex align-items-center gap-1 ms-auto px-2 shrink-0">
        <button data-slot="session-switch" type="button" class="btn btn-sm btn-link p-0 px-1 text-secondary text-decoration-none" title="セッション一覧" aria-label="セッション一覧" aria-haspopup="listbox"><i class="bi bi-clock-history"></i></button>
        <button data-slot="session-close" type="button" class="btn btn-sm btn-link p-0 px-1 text-secondary text-decoration-none" title="チャットペインを隠す" aria-label="チャットペインを隠す"><i class="bi bi-x-lg"></i></button>
      </div>
    </div>
    <div data-slot="session-popup" class="position-absolute end-0 bg-body border rounded shadow-sm d-none" style="z-index:1080;min-width:220px;max-width:320px;overflow-y:auto" role="listbox"></div>
  </div>
`;

/**
 * Renders the chat pane's header as session tabs plus a clock-popup switcher.
 * @param {Object} props - `{ openIds, sessions, currentId, onSelect, onNew, onCloseTab, onRename, onClose }` accessors/callbacks. `openIds` is the ordered list of open session ids; `sessions` is the full session list (for names + the popup).
 * @returns {HTMLElement} The tab bar root element.
 */
export function SessionTabBar(props) {
  const tpl = document.createElement("template");
  tpl.innerHTML = BAR_HTML;
  const bar = tpl.content.firstElementChild;
  const tabsEl = bar.querySelector('[data-slot="session-tabs"]');
  const newButton = bar.querySelector('[data-slot="session-new"]');
  const switchBtn = bar.querySelector('[data-slot="session-switch"]');
  const closeButton = bar.querySelector('[data-slot="session-close"]');
  const popup = bar.querySelector('[data-slot="session-popup"]');
  const catEl = bar.querySelector('[data-slot="category-tabs"]');

  // Outer category tabs. Only "チャット" exists today (active, owning the session
  // tabs below); the strip is data-driven so future categories slot straight in.
  catEl.replaceChildren(...CATEGORIES.map(c => {
    const t = document.createElement("button");
    t.type = "button";
    t.dataset.slot = "category-tab";
    t.dataset.categoryId = c.id;
    const active = c.id === "chat";
    t.dataset.active = active ? "true" : "false";
    t.className = "btn btn-sm btn-link d-flex align-items-center gap-1 px-2 text-decoration-none small shrink-0 " + (active ? "text-body fw-medium" : "text-secondary");
    t.style.borderBottom = active ? "2px solid var(--bs-primary)" : "2px solid transparent";
    t.innerHTML = `<i class="bi ${c.icon}"></i><span>${c.label}</span>`;
    return t;
  }));

  const sessionById = id => (props.sessions?.() ?? []).find(s => s?.id === id);
  const titleOf = id => sessionTitle(sessionById(id)?.title) || (id ? id.slice(0, 8) : NEW_TAB_LABEL);

  // --- Session tabs (one per open session + the unsaved "new" tab) ---
  const [editing, setEditing] = createSignal(null); // id being renamed, or null
  let editSeed = "";
  createRenderEffect(() => {
    const open = props.openIds?.() ?? [];
    const active = props.currentId?.();
    const editId = editing();
    // Tab list = open sessions, plus a transient "new session" tab when the
    // active view has no session id (the blank composer from "+").
    const ids = [...open];
    if (!active && !ids.includes(null)) ids.push(null);
    tabsEl.replaceChildren(...ids.map(id => buildTab(id, id === active, editId === id)));
  });

  /**
   * Build one session tab (or the transient "new session" tab when id is null),
   * wired for select / inline rename / close / middle-click close.
   * @param {string|null} id - The session id, or null for the unsaved "new" tab.
   * @param {boolean} isActive - Whether this tab is the active session.
   * @param {boolean} isEditing - Whether this tab is in inline-rename mode.
   * @returns {HTMLElement} The tab element.
   */
  function buildTab(id, isActive, isEditing) {
    const tab = document.createElement("div");
    tab.dataset.slot = "session-tab";
    tab.dataset.active = isActive ? "true" : "false";
    if (id) tab.dataset.sessionId = id;
    tab.className = "d-flex align-items-center gap-1 px-2 border-end small shrink-0" + (isActive ? " bg-body text-body fw-medium" : " text-secondary");
    tab.style.borderBottom = isActive ? "2px solid var(--bs-primary)" : "2px solid transparent";

    // Middle-click closes the tab (standard browser-tab affordance). Suppress the
    // middle-button mousedown so it doesn't start the OS autoscroll.
    if (id) {
      tab.addEventListener("mousedown", e => { if (e.button === 1) e.preventDefault(); });
      tab.addEventListener("auxclick", e => { if (e.button === 1) { e.preventDefault(); props.onCloseTab?.(id); } });
    }

    if (isEditing && id) {
      const input = document.createElement("input");
      input.type = "text";
      input.dataset.slot = "session-name-input";
      input.className = "form-control form-control-sm py-0";
      input.style.maxWidth = "180px";
      input.value = editSeed;
      const commit = () => {
        if (editing() !== id) return;
        const next = input.value.trim();
        const cur = sessionTitle(sessionById(id)?.title) || "";
        setEditing(null);
        if (next && next !== cur) props.onRename?.(id, next);
      };
      input.addEventListener("keydown", e => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { e.preventDefault(); setEditing(null); }
      });
      input.addEventListener("blur", commit);
      tab.appendChild(input);
      requestAnimationFrame(() => { input.focus(); input.select(); });
      return tab;
    }

    const label = document.createElement("button");
    label.type = "button";
    label.dataset.slot = "session-tab-label";
    label.className = "btn btn-sm btn-link p-0 text-truncate text-decoration-none " + (isActive ? "text-body" : "text-secondary");
    label.style.maxWidth = "200px";
    label.textContent = titleOf(id);
    label.title = titleOf(id);
    label.addEventListener("click", () => { if (id !== props.currentId?.()) selectId(id); });
    if (id) label.addEventListener("dblclick", () => beginRename(id));
    tab.appendChild(label);

    if (isActive && id) {
      const pencil = document.createElement("button");
      pencil.type = "button";
      pencil.dataset.slot = "session-rename";
      pencil.className = "btn btn-sm btn-link p-0 px-1 text-secondary text-decoration-none";
      pencil.title = "名前を変更"; pencil.setAttribute("aria-label", "名前を変更");
      pencil.innerHTML = '<i class="bi bi-pencil"></i>';
      pencil.addEventListener("click", () => beginRename(id));
      tab.appendChild(pencil);
    }
    if (id) {
      const close = document.createElement("button");
      close.type = "button";
      close.dataset.slot = "session-tab-close";
      close.className = "btn btn-sm btn-link p-0 px-1 text-secondary text-decoration-none";
      close.title = "タブを閉じる"; close.setAttribute("aria-label", "タブを閉じる");
      close.innerHTML = '<i class="bi bi-x"></i>';
      close.addEventListener("click", e => { e.stopPropagation(); props.onCloseTab?.(id); });
      tab.appendChild(close);
    }
    return tab;
  }

  /**
   * Enter inline-rename mode for a session tab, seeding the editor with its title.
   * @param {string} id - The session id to rename (no-op when falsy).
   * @returns {void}
   */
  function beginRename(id) {
    if (!id) return;
    editSeed = sessionTitle(sessionById(id)?.title) || "";
    setEditing(id);
  }
  /**
   * Activate a tab by id: switch to that session, or re-open the blank composer
   * for the transient "new" tab (null id).
   * @param {string|null} id - The session id, or null for the "new" tab.
   * @returns {void}
   */
  function selectId(id) {
    const s = id ? sessionById(id) : null;
    if (s) props.onSelect?.(s);
    else if (!id) props.onNew?.(); // the "new" tab re-opens the blank composer
  }

  // --- Clock popup: searchable, scrollable session list with per-row actions ---
  ensurePopupStyle();
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [rowEditing, setRowEditing] = createSignal(null);  // session id being renamed
  const [rowDeleting, setRowDeleting] = createSignal(null); // session id awaiting delete confirm

  // Persistent popup chrome (built once): a sticky search box ABOVE the top item,
  // a scrolling items area, and a "load more" button BELOW the bottom item. Only
  // the items area re-renders on filter/data changes, so the search keeps focus.
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.dataset.slot = "session-popup-search";
  searchInput.placeholder = "セッションを検索…";
  searchInput.className = "form-control form-control-sm rounded-0 border-0 border-bottom sticky-top";
  searchInput.style.background = "var(--bs-body-bg)";
  searchInput.addEventListener("input", () => setQuery(searchInput.value));
  searchInput.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") setOpen(false); });
  const itemsEl = document.createElement("div");
  itemsEl.dataset.slot = "session-popup-items";
  const loadMoreBtn = document.createElement("button");
  loadMoreBtn.type = "button";
  loadMoreBtn.dataset.slot = "session-popup-loadmore";
  loadMoreBtn.className = "btn btn-sm btn-link d-block w-100 text-decoration-none border-top py-1 d-none";
  loadMoreBtn.textContent = "もっと読む";
  loadMoreBtn.addEventListener("click", e => { e.stopPropagation(); props.onLoadMore?.(); });
  popup.append(searchInput, itemsEl, loadMoreBtn);

  // The bar sits near the BOTTOM of the window (it's the top of the bottom chat
  // pane), so a fixed drop-DOWN of 320px runs off-screen and the lower items
  // become unreachable. Place dynamically: prefer dropping down but cap the
  // height to the space actually available, and flip UP when there's more room
  // above — so the whole list is always on-screen and internally scrollable.
  const placePopup = () => {
    const r = bar.getBoundingClientRect();
    const margin = 8;
    const below = window.innerHeight - r.bottom - margin;
    const above = r.top - margin;
    const dropDown = below >= 200 || below >= above;
    popup.style.top = dropDown ? "100%" : "auto";
    popup.style.bottom = dropDown ? "auto" : "100%";
    popup.style.maxHeight = Math.max(120, Math.min(360, dropDown ? below : above)) + "px";
  };
  createRenderEffect(() => {
    const isOpen = open();
    popup.classList.toggle("d-none", !isOpen);
    if (isOpen) { placePopup(); requestAnimationFrame(() => searchInput.focus()); }
    else { setQuery(""); searchInput.value = ""; setRowEditing(null); setRowDeleting(null); }
  });
  const onResize = () => { if (open()) placePopup(); };
  window.addEventListener("resize", onResize);
  onCleanup(() => window.removeEventListener("resize", onResize));

  /**
   * Build one row of the clock-history popup: the session label plus hover
   * edit/delete actions, or the inline rename input / delete-confirm prompt when
   * that row is toggled into editing / deleting state.
   * @param {Object} s - The session record (`{ id, title, ... }`).
   * @param {string} active - The active session id (for highlighting).
   * @returns {HTMLElement} The popup row element.
   */
  function buildPopupRow(s, active) {
    const row = document.createElement("div");
    row.dataset.slot = "session-popup-row";
    if (s.id) row.dataset.sessionId = s.id;
    row.className = "d-flex align-items-center gap-1 px-2 py-1 small" + (s.id === active ? " bg-body-secondary" : "");

    if (rowEditing() === s.id) {
      const input = document.createElement("input");
      input.type = "text";
      input.dataset.slot = "session-popup-rename-input";
      input.className = "form-control form-control-sm py-0";
      input.value = sessionTitle(s.title) || "";
      const commit = () => {
        if (rowEditing() !== s.id) return;
        const next = input.value.trim();
        const cur = sessionTitle(s.title) || "";
        setRowEditing(null);
        if (next && next !== cur) props.onRename?.(s.id, next);
      };
      input.addEventListener("keydown", e => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { e.preventDefault(); setRowEditing(null); }
      });
      input.addEventListener("blur", commit);
      row.appendChild(input);
      requestAnimationFrame(() => { input.focus(); input.select(); });
      return row;
    }

    if (rowDeleting() === s.id) {
      const msg = document.createElement("span");
      msg.className = "text-truncate flex-grow-1 text-danger";
      msg.textContent = "削除しますか？";
      const yes = document.createElement("button");
      yes.type = "button";
      yes.dataset.slot = "session-popup-delete-yes";
      yes.className = "btn btn-sm btn-danger py-0 px-2";
      yes.textContent = "はい";
      yes.addEventListener("click", e => { e.stopPropagation(); setRowDeleting(null); props.onDelete?.(s.id); });
      const no = document.createElement("button");
      no.type = "button";
      no.dataset.slot = "session-popup-delete-no";
      no.className = "btn btn-sm btn-link py-0 px-2 text-secondary text-decoration-none";
      no.textContent = "いいえ";
      no.addEventListener("click", e => { e.stopPropagation(); setRowDeleting(null); });
      row.append(msg, yes, no);
      return row;
    }

    const label = document.createElement("button");
    label.type = "button";
    label.dataset.slot = "session-popup-item";
    label.className = "btn btn-sm btn-link flex-grow-1 text-start text-truncate text-decoration-none p-0 " + (s.id === active ? "fw-medium text-body" : "text-body");
    label.textContent = sessionTitle(s.title) || s.id.slice(0, 8);
    label.title = label.textContent;
    label.addEventListener("click", () => { props.onSelect?.(s); setOpen(false); });
    const edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.slot = "session-popup-edit";
    edit.className = "btn btn-sm btn-link p-0 px-1 text-secondary text-decoration-none cc-popup-action";
    edit.title = "名前を変更"; edit.setAttribute("aria-label", "名前を変更");
    edit.innerHTML = '<i class="bi bi-pencil"></i>';
    edit.addEventListener("click", e => { e.stopPropagation(); setRowDeleting(null); setRowEditing(s.id); });
    const del = document.createElement("button");
    del.type = "button";
    del.dataset.slot = "session-popup-delete";
    del.className = "btn btn-sm btn-link p-0 px-1 text-danger text-decoration-none cc-popup-action";
    del.title = "履歴を削除"; del.setAttribute("aria-label", "履歴を削除");
    del.innerHTML = '<i class="bi bi-trash"></i>';
    del.addEventListener("click", e => { e.stopPropagation(); setRowEditing(null); setRowDeleting(s.id); });
    row.append(label, edit, del);
    return row;
  }

  createRenderEffect(() => {
    if (!open()) return;
    const q = query().trim().toLowerCase();
    const active = props.currentId?.();
    const all = (props.sessions?.() ?? []).filter(Boolean);
    const sessions = q ? all.filter(s => (sessionTitle(s.title) || s.id || "").toLowerCase().includes(q)) : all;
    rowEditing(); rowDeleting(); // depend on row-state so the list rebuilds on edit/delete toggles
    itemsEl.replaceChildren(...sessions.map(s => buildPopupRow(s, active)));
    if (!sessions.length) {
      const empty = document.createElement("div");
      empty.className = "text-secondary small px-2 py-2 text-center";
      empty.textContent = q ? "一致するセッションがありません" : "セッションがありません";
      itemsEl.appendChild(empty);
    }
  });
  createRenderEffect(() => {
    loadMoreBtn.classList.toggle("d-none", !(open() && !!props.hasMore?.()));
  });
  switchBtn.addEventListener("click", e => { e.stopPropagation(); setOpen(v => !v); });
  const onDocDown = e => { if (open() && !popup.contains(e.target) && !switchBtn.contains(e.target)) setOpen(false); };
  document.addEventListener("mousedown", onDocDown);
  onCleanup(() => document.removeEventListener("mousedown", onDocDown));

  newButton.addEventListener("click", () => props.onNew?.());
  closeButton.addEventListener("click", () => props.onClose?.());
  return bar;
}
