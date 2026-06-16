import { Button } from "@/bs/button.js";
import { Icon } from "@/bs/icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { TextField } from "@/bs/text-field.js";
import { createComponent, createEffect, onCleanup } from "../lib/reactivity.js";
import { createStore, reconcile } from "../lib/store.js";
import { useLanguage } from "@/context/language.js";
import { normalizeServerUrl, ServerConnection, useServer } from "@/context/server.js";
import { useCheckServerHealth } from "@/utils/server-health.js";
import { ServerHealthIndicator, ServerRow } from "@/components/server/server-row.js";

/** @file Server settings pane: lists configured servers with live health, and an inline add/edit form. */

/** Interval in milliseconds between server-health refresh polls. */
const HEALTH_POLL_INTERVAL_MS = 10_000;
/**
 * Build the initial add/edit form state.
 * @returns {Object} A blank form ({open, mode, id, url, name, error, busy}).
 */
const emptyForm = () => ({
  open: false,
  mode: "add",
  id: undefined,
  url: "",
  name: "",
  error: "",
  busy: false
});

/**
 * Build a detached element from an HTML string (trimmed, first child returned).
 * @param {string} html - Markup for a single root element.
 * @returns {Element} The constructed element.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

/**
 * Server settings view. Renders the list of configured server connections with live
 * health indicators (active server selectable, http servers editable/removable) and
 * an inline add/edit form that validates the URL via a health check before saving.
 * @returns {Node} The settings pane root element.
 */
export const SettingsServer = () => {
  const language = useLanguage();
  const server = useServer();
  const checkServerHealth = useCheckServerHealth();
  const [state, setState] = createStore({
    status: {},
    form: emptyForm()
  });
  /**
   * Re-check health for every http connection and write the results into state.status.
   * @returns {Promise<void>} Resolves once all health checks complete and state is updated.
   */
  async function refreshHealth() {
    const list = server.list;
    const results = {};
    await Promise.all(list.map(async conn => {
      if (conn.type !== "http") return;
      results[ServerConnection.key(conn)] = await checkServerHealth(conn.http);
    }));
    setState("status", reconcile(results));
  }
  createEffect(() => {
    server.list;
    void refreshHealth();
    const id = setInterval(() => void refreshHealth(), HEALTH_POLL_INTERVAL_MS);
    onCleanup(() => clearInterval(id));
  });
  /**
   * Make a connection the active server, unless it is already active or unhealthy.
   * @param {Object} conn - A server connection.
   * @returns {void}
   */
  const switchTo = conn => {
    const key = ServerConnection.key(conn);
    if (key === server.key) return;
    if (state.status[key]?.healthy === false) return;
    server.setActive(key);
  };
  /**
   * Open the form in "add" mode with blank fields.
   * @returns {void}
   */
  const openAdd = () => setState("form", {
    ...emptyForm(),
    open: true,
    mode: "add"
  });
  /**
   * Open the form in "edit" mode pre-filled from an http connection.
   * @param {Object} conn - The http server connection to edit.
   * @returns {void}
   */
  const openEdit = conn => {
    if (conn.type !== "http") return;
    setState("form", {
      open: true,
      mode: "edit",
      id: conn.http.url,
      url: conn.http.url,
      name: conn.displayName ?? "",
      error: "",
      busy: false
    });
  };
  /**
   * Close and reset the add/edit form.
   * @returns {void}
   */
  const cancelForm = () => setState("form", emptyForm());
  /**
   * Remove a server connection and refresh health.
   * @param {Object} conn - The server connection to remove.
   * @returns {void}
   */
  const removeServer = conn => {
    server.remove(ServerConnection.key(conn));
    void refreshHealth();
  };
  /**
   * Validate and submit the add/edit form: normalize the URL, health-check it, then
   * add (or, in edit mode, replace the original while preserving the active selection).
   * @returns {Promise<void>} Resolves once the form is submitted or an error is shown.
   */
  async function submitForm() {
    if (state.form.busy) return;
    const normalized = normalizeServerUrl(state.form.url);
    if (!normalized) {
      setState("form", "error", language.t("dialog.server.add.error"));
      return;
    }
    const name = state.form.name.trim() || undefined;
    const conn = {
      type: "http",
      http: {
        url: normalized
      }
    };
    if (name) conn.displayName = name;
    setState("form", {
      busy: true,
      error: ""
    });
    const result = await checkServerHealth(conn.http);
    if (!result.healthy) {
      setState("form", {
        busy: false,
        error: language.t("dialog.server.add.error")
      });
      return;
    }
    if (state.form.mode === "edit" && state.form.id && state.form.id !== normalized) {
      const original = server.list.find(x => x.type === "http" && x.http.url === state.form.id);
      const active = server.key;
      const added = server.add(conn);
      if (original) {
        const origKey = ServerConnection.key(original);
        if (added && active === origKey) server.setActive(ServerConnection.key(added));
        server.remove(origKey);
      }
    } else {
      server.add(conn);
    }
    cancelForm();
    void refreshHealth();
  }

  const root = template(`
    <div class="d-flex flex-column h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="d-flex flex-column gap-1 pt-6 pb-8 max-w-[720px]">
          <h2 class="fs-6 fw-medium text-body-emphasis" data-slot="title"></h2>
          <span class="small fw-normal text-secondary" data-slot="description"></span>
        </div>
      </div>
      <div class="d-flex flex-column gap-4 max-w-[720px]">
        <div style="display: contents" data-slot="list"></div>
        <div style="display: contents" data-slot="form"></div>
      </div>
    </div>`);
  const titleEl = root.querySelector('[data-slot="title"]');
  const descEl = root.querySelector('[data-slot="description"]');
  const listSlot = root.querySelector('[data-slot="list"]');
  const formSlot = root.querySelector('[data-slot="form"]');

  createEffect(() => { titleEl.textContent = language.t("settings.server.title"); });
  createEffect(() => { descEl.textContent = language.t("dialog.server.description"); });

  /**
   * Build one server-list row (health dot, ServerRow, active check, and edit/delete
   * controls for http servers); clicking the row switches the active server.
   * @param {Object} conn - The server connection to render.
   * @returns {Element} The row element.
   */
  const buildRow = conn => {
    const key = ServerConnection.key(conn);
    const row = template(`<div class="group d-flex align-items-center gap-3 py-2.5 px-3 rounded-2 cursor-pointer"></div>`);
    row.addEventListener("click", () => switchTo(conn));
    row.appendChild(createComponent(ServerHealthIndicator, {
      get health() { return state.status[key]; }
    }));
    row.appendChild(createComponent(ServerRow, {
      conn: conn,
      get status() { return state.status[key]; },
      showCredentials: true,
      class: "d-flex align-items-center gap-2 min-w-0 flex-1",
      nameClass: "fw-medium text-body-emphasis truncate",
      versionClass: "small fw-normal text-secondary truncate"
    }));
    const right = template(`<div class="d-flex align-items-center gap-1 shrink-0"></div>`);
    if (server.key === key) {
      right.appendChild(createComponent(Icon, {
        name: "check",
        class: "text-secondary shrink-0"
      }));
    }
    // Edit / delete only apply to user-added http servers. The built-in
    // local server (type !== "http") is not editable/removable, so don't
    // render dead controls for it (the pencil otherwise silently no-ops).
    if (conn.type === "http") {
      right.appendChild(createComponent(IconButton, {
        icon: "pencil-line",
        variant: "ghost",
        get ["aria-label"]() { return language.t("dialog.server.menu.edit"); },
        onClick: e => {
          e?.stopPropagation?.();
          openEdit(conn);
        }
      }));
      right.appendChild(createComponent(IconButton, {
        icon: "circle-x",
        variant: "ghost",
        get ["aria-label"]() { return language.t("dialog.server.menu.delete"); },
        onClick: e => {
          e?.stopPropagation?.();
          removeServer(conn);
        }
      }));
    }
    row.appendChild(right);
    return row;
  };

  // Server list (or the disconnected note). Rebuilt when the list, the active
  // server or the locale changes; per-row health flows through component
  // getters without a rebuild.
  createEffect(() => {
    const list = server.list;
    void server.key;
    if (list.length === 0) {
      const empty = template(`<div class="fw-normal text-secondary py-3"></div>`);
      empty.textContent = language.t("settings.server.disconnected");
      listSlot.replaceChildren(empty);
      return;
    }
    const box = template(`<div class="d-flex flex-column gap-1 bg-body-tertiary rounded-3 p-2"></div>`);
    for (const conn of list) box.appendChild(buildRow(conn));
    listSlot.replaceChildren(box);
  });

  // Add button (closed) / inline add-edit form (open). The form is built once
  // per open so typing in the TextFields never loses focus; error text and the
  // submit/cancel buttons live in nested slots with their own effects.
  createEffect(() => {
    if (!state.form.open) {
      const label = language.t("dialog.server.add.button");
      const add = createComponent(Button, {
        variant: "secondary",
        class: "self-start h-8 px-3 py-1.5",
        onClick: openAdd,
        get children() {
          return [createComponent(Icon, { name: "plus-small" }), label];
        }
      });
      formSlot.replaceChildren(add);
      return;
    }
    const form = template(`
      <div class="d-flex flex-column gap-3 p-3 rounded-3 bg-body-tertiary">
        <div style="display: contents" data-slot="fields"></div>
        <div style="display: contents" data-slot="error"></div>
        <div class="d-flex align-items-center gap-2" data-slot="buttons"></div>
      </div>`);
    const fields = form.querySelector('[data-slot="fields"]');
    const errorSlot = form.querySelector('[data-slot="error"]');
    const buttons = form.querySelector('[data-slot="buttons"]');

    fields.appendChild(createComponent(TextField, {
      type: "text",
      get value() { return state.form.url; },
      onChange: v => setState("form", {
        url: v,
        error: ""
      }),
      get placeholder() { return language.t("dialog.server.add.placeholder"); },
      spellcheck: false,
      autocorrect: "off",
      autocomplete: "off",
      autocapitalize: "off"
    }));
    fields.appendChild(createComponent(TextField, {
      type: "text",
      get value() { return state.form.name; },
      onChange: v => setState("form", {
        name: v
      }),
      get placeholder() { return language.t("dialog.server.add.namePlaceholder"); },
      spellcheck: false,
      autocorrect: "off",
      autocomplete: "off",
      autocapitalize: "off"
    }));
    createEffect(() => {
      if (state.form.error) {
        const err = template(`<span class="small fw-normal text-danger"></span>`);
        err.textContent = state.form.error;
        errorSlot.replaceChildren(err);
      } else {
        errorSlot.replaceChildren();
      }
    });
    // The submit label depends on busy/mode (and the locale), and the vanilla
    // Button renders its children once — rebuild the pair when those change.
    createEffect(() => {
      const busy = state.form.busy;
      const submitLabel = busy
        ? language.t("dialog.server.add.checking")
        : state.form.mode === "edit"
          ? language.t("common.save")
          : language.t("dialog.server.add.button");
      const cancelLabel = language.t("common.cancel");
      buttons.replaceChildren(
        createComponent(Button, {
          variant: "primary",
          disabled: busy,
          onClick: submitForm,
          get children() { return submitLabel; }
        }),
        createComponent(Button, {
          variant: "secondary",
          onClick: cancelForm,
          get children() { return cancelLabel; }
        })
      );
    });
    formSlot.replaceChildren(form);
  });

  return root;
};
