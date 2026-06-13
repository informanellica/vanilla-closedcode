// Bottom-pane header (top of the chat pane). Left: view tabs — currently just
// "チャット", with Output / Terminal / Debug to be added here later. Right:
// session controls — a select box to switch sessions, "+" to start a new one,
// and "×" to close (archive) the current one.
import { createRenderEffect } from "../../lib/reactivity.js";
import { sessionTitle } from "@/utils/session-title.js";

// View tabs of the bottom pane. Only "chat" is wired today; the others are
// placeholders for the upcoming output / terminal / debug roles.
const VIEW_TABS = [{ id: "chat", label: "チャット" }];

// Static skeleton; dynamic parts hook in via [data-slot] placeholders.
const BAR_HTML = `
  <div data-component="session-tab-bar" class="shrink-0 d-flex align-items-stretch bg-body-tertiary border-bottom" style="min-height:32px">
    <div data-slot="view-tabs" class="d-flex align-items-stretch"></div>
    <div data-slot="controls" class="d-flex align-items-center gap-1 ms-auto px-2">
      <select data-slot="session-select" class="form-select form-select-sm w-auto" style="max-width:220px" title="セッションを切り替え" aria-label="セッションを切り替え"></select>
      <button data-slot="session-new" type="button" class="btn btn-sm btn-link p-0 px-1 text-secondary text-decoration-none" title="新しいセッション" aria-label="新しいセッション"><i class="bi bi-plus-lg"></i></button>
      <button data-slot="session-close" type="button" class="btn btn-sm btn-link p-0 px-1 text-secondary text-decoration-none" title="チャットペインを隠す" aria-label="チャットペインを隠す"><i class="bi bi-x-lg"></i></button>
    </div>
  </div>
`;

export function SessionTabBar(props) {
  const tpl = document.createElement("template");
  tpl.innerHTML = BAR_HTML;
  const bar = tpl.content.firstElementChild;
  const tabs = bar.querySelector('[data-slot="view-tabs"]');
  const select = bar.querySelector('[data-slot="session-select"]');
  const newButton = bar.querySelector('[data-slot="session-new"]');
  const closeButton = bar.querySelector('[data-slot="session-close"]');

  // --- Left: view tabs (Chat; Output / Terminal / Debug come here later) ---
  // VIEW_TABS is a static constant, so the tabs are built once.
  for (const tab of VIEW_TABS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-sm rounded-0 border-0 px-3 d-flex align-items-center small fw-medium text-decoration-none";
    button.textContent = tab.label;
    // Single active view for now; styled like the editor/session tabs.
    const active = tab.id === "chat";
    button.classList.toggle("bg-body", active);
    button.classList.toggle("text-body", active);
    button.classList.toggle("text-secondary", !active);
    button.style.borderBottom = active ? "2px solid var(--bs-primary)" : "2px solid transparent";
    tabs.appendChild(button);
  }

  // --- Right: session controls (switch / new / close) ---
  // Rebuild the option list whenever the session list changes. Registered
  // before the value-sync effect below so options exist when value is applied.
  createRenderEffect(() => {
    const sessions = props.sessions?.() ?? [];
    select.replaceChildren(...sessions.map(session => {
      const option = document.createElement("option");
      option.value = session.id;
      option.textContent = sessionTitle(session.title) || (session.id ? session.id.slice(0, 8) : "session");
      return option;
    }));
  });
  select.addEventListener("change", () => {
    const s = (props.sessions?.() ?? []).find(x => x.id === select.value);
    if (s) props.onSelect?.(s);
  });
  // Keep the selected option in sync with the active session (re-run when the
  // session list loads so the value applies once its option exists).
  createRenderEffect(() => {
    props.sessions?.();
    select.value = props.currentId?.() ?? "";
  });
  newButton.addEventListener("click", () => props.onNew?.());
  closeButton.addEventListener("click", () => props.onClose?.());
  return bar;
}
