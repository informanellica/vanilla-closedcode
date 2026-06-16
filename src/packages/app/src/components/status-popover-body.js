import { Button } from "@/bs/button.js";
import { useDialog } from "@/lib/dialog.js";
import { Icon } from "@/bs/icon.js";
import { Switch } from "@/bs/switch.js";
import { Tabs } from "@/bs/tabs.js";
import { showToast } from "@/lib/toast.js";
import { useNavigate } from "../lib/router/index.js";
import { createComponent, createEffect, createMemo, createRenderEffect, onCleanup, untrack } from "../lib/reactivity.js";
import { createStore, reconcile } from "../lib/store.js";
import { ServerHealthIndicator, ServerRow } from "@/components/server/server-row.js";
import { useLanguage } from "@/context/language.js";
import { usePlatform } from "@/context/platform.js";
import { normalizeServerUrl, ServerConnection, useServer } from "@/context/server.js";
import { useSync } from "@/context/sync.js";
import { useCheckServerHealth } from "@/utils/server-health.js";
import { useMcpController } from "@/controllers/mcp.js";

/** @file Status popover body: tabbed view (servers / MCP / LSP / plugins) with live health and toggles. */

/** Interval in milliseconds between server-health refresh polls. */
const pollMs = 10_000;

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
/**
 * Build a detached element from compact HTML (first child returned).
 * @param {string} html - Markup for a single root element.
 * @returns {Element} The constructed element.
 */
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Toggle space-separated class keys per the boolean map, mirroring Solid's
// classList semantics (the key sets used here are constant across runs).
/**
 * Toggle space-separated class keys on an element per a boolean map.
 * @param {Element} el - The element to update.
 * @param {Object} classes - Map of "space separated class" keys to booleans.
 * @returns {void}
 */
function applyClassList(el, classes) {
  for (const key in classes) {
    const tokens = key.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    if (classes[key]) el.classList.add(...tokens);
    else el.classList.remove(...tokens);
  }
}

// Plugins empty message, split so the config file name renders inside a
// <code> chip. Returns an array of strings/nodes for replaceChildren; the
// translated text always flows through text nodes (never markup).
/**
 * Split a translated "no plugins" message around a config file name so the file
 * name can render inside a <code> chip.
 * @param {string} value - The full translated message.
 * @param {string} file - The config file name to highlight.
 * @returns {Array} Strings/nodes suitable for replaceChildren.
 */
const pluginEmptyMessage = (value, file) => {
  const parts = value.split(file);
  if (parts.length === 1) return [value];
  const code = template(`<code class="bg-body-tertiary px-1.5 py-0.5 rounded-1 text-body"></code>`);
  code.textContent = file;
  return [parts[0], code, parts.slice(1).join(file)];
};
/**
 * Sort server connections for display: the active server first, then by health
 * (healthy, unknown, unhealthy), preserving the original order as a tie-breaker.
 * @param {Array} list - The server connections.
 * @param {string} active - Key of the active server connection.
 * @param {Object} status - Map of connection key to health result.
 * @returns {Array} A new sorted array of connections.
 */
const listServersByHealth = (list, active, status) => {
  if (!list.length) return list;
  const order = new Map(list.map((url, index) => [url, index]));
  const rank = value => {
    if (value?.healthy === true) return 0;
    if (value?.healthy === false) return 2;
    return 1;
  };
  return list.slice().sort((a, b) => {
    if (ServerConnection.key(a) === active) return -1;
    if (ServerConnection.key(b) === active) return 1;
    const diff = rank(status[ServerConnection.key(a)]) - rank(status[ServerConnection.key(b)]);
    if (diff !== 0) return diff;
    return (order.get(a) ?? 0) - (order.get(b) ?? 0);
  });
};
/**
 * Reactive hook that polls health for a reactive server list while enabled.
 * @param {Function} servers - Accessor returning the current server connections.
 * @param {Function} enabled - Accessor returning whether polling is active.
 * @returns {Object} A store mapping connection key to its latest health result.
 */
const useServerHealth = (servers, enabled) => {
  const checkServerHealth = useCheckServerHealth();
  const [status, setStatus] = createStore({});
  createEffect(() => {
    if (!enabled()) {
      setStatus(reconcile({}));
      return;
    }
    const list = servers();
    let dead = false;
    const refresh = async () => {
      const results = {};
      await Promise.all(list.map(async conn => {
        results[ServerConnection.key(conn)] = await checkServerHealth(conn.http);
      }));
      if (dead) return;
      setStatus(reconcile(results));
    };
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    onCleanup(() => {
      dead = true;
      clearInterval(id);
    });
  });
  return status;
};
/**
 * Reactive hook resolving the default server's connection key, supporting sync or
 * Promise-returning getters and a manual refresh.
 * @param {Function} get - Accessor/getter returning the default server URL (or a Promise of it).
 * @returns {Object} An object with a key() accessor and a refresh() trigger.
 */
const useDefaultServerKey = get => {
  const [state, setState] = createStore({
    url: undefined,
    tick: 0
  });
  createEffect(() => {
    state.tick;
    let dead = false;
    const result = get?.();
    if (!result) {
      setState("url", undefined);
      onCleanup(() => {
        dead = true;
      });
      return;
    }
    if (result instanceof Promise) {
      void result.then(next => {
        if (dead) return;
        setState("url", next ? normalizeServerUrl(next) : undefined);
      });
      onCleanup(() => {
        dead = true;
      });
      return;
    }
    setState("url", normalizeServerUrl(result));
    onCleanup(() => {
      dead = true;
    });
  });
  return {
    key: () => {
      const u = state.url;
      if (!u) return;
      return ServerConnection.key({
        type: "http",
        http: {
          url: u
        }
      });
    },
    refresh: () => setState("tick", value => value + 1)
  };
};
/**
 * Status popover body. A tabbed panel (servers / MCP / LSP / plugins) with live
 * counts in each tab label, server rows that switch the active server, MCP toggle
 * switches, and LSP/plugin status lists.
 * @param {Object} props - Component props.
 * @param {Function} props.shown - Accessor returning whether the popover is open (gates health polling).
 * @returns {Node} The popover body root element.
 */
export function StatusPopoverBody(props) {
  const sync = useSync();
  const server = useServer();
  const platform = usePlatform();
  const dialog = useDialog();
  const language = useLanguage();
  const navigate = useNavigate();
  /**
   * Show an error toast for a failed request.
   * @param {*} err - The error (Error or otherwise).
   * @returns {void}
   */
  const fail = err => {
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: err instanceof Error ? err.message : String(err)
    });
  };
  // The compiled output kept this (empty) tracking effect; preserved verbatim.
  createEffect(() => {
    if (!props.shown()) return;
  });
  let dialogRun = 0;
  let dialogDead = false;
  onCleanup(() => {
    dialogDead = true;
    dialogRun += 1;
  });
  const servers = createMemo(() => {
    const current = server.current;
    const list = server.list;
    if (!current) return list;
    if (list.every(item => ServerConnection.key(item) !== ServerConnection.key(current))) return [current, ...list];
    return [current, ...list.filter(item => ServerConnection.key(item) !== ServerConnection.key(current))];
  });
  const health = useServerHealth(servers, props.shown);
  const sortedServers = createMemo(() => listServersByHealth(servers(), server.key, health));
  const mcp = useMcpController({ onError: fail });
  const defaultServer = useDefaultServerKey(platform.getDefaultServer);
  const mcpNames = createMemo(() => Object.keys(sync.data?.mcp ?? {}).sort((a, b) => a.localeCompare(b)));
  const mcpStatus = mcp.statusOf;
  const mcpConnected = createMemo(() => mcpNames().filter(name => mcpStatus(name) === "connected").length);
  const lspItems = createMemo(() => sync.data?.lsp ?? []);
  const lspCount = createMemo(() => lspItems().length);
  const plugins = createMemo(() => (sync.data?.config.plugin ?? []).map(item => typeof item === "string" ? item : item[0]));
  const pluginCount = createMemo(() => plugins().length);
  const pluginEmpty = createMemo(() => pluginEmptyMessage(language.t("dialog.plugins.empty"), "closedcode.json"));

  // Shared per-tab body (_tmpl$2): outer padding wrapper + inner card.
  /**
   * Build the shared per-tab body shell.
   * @returns {Object} An object with the {outer} wrapper and the inner {body} card element.
   */
  const buildTabBody = () => {
    const outer = template(`<div class="d-flex flex-column px-2 pb-2"><div class="d-flex flex-column p-3 bg-body rounded-1 min-h-14"></div></div>`);
    return { outer, body: outer.firstElementChild };
  };

  // Centered empty-state line (_tmpl$7) whose translated text stays live.
  /**
   * Build a centered empty-state line whose text tracks a reactive reader.
   * @param {Function} read - Accessor returning the (translated) text to display.
   * @returns {Element} The empty-state element.
   */
  const buildEmpty = read => {
    const empty = template(`<div class="fw-normal text-body text-center my-auto"></div>`);
    createRenderEffect(() => {
      empty.textContent = read();
    });
    return empty;
  };

  // Tab trigger with a live "{count} {label}" caption. A SINGLE accessor:
  // the bs Trigger routes function children through marker-less insert(),
  // where sibling text accessors would clobber each other.
  /**
   * Build a tab trigger whose caption is a live "{count} {label}".
   * @param {string} value - The tab's value (selection key).
   * @param {Function} count - Accessor returning the current count shown before the label.
   * @param {string} labelKey - i18n key for the tab label.
   * @returns {Node} The Tabs.Trigger component.
   */
  const buildTrigger = (value, count, labelKey) => createComponent(Tabs.Trigger, {
    value,
    class: "small fw-normal",
    get children() {
      return () => `${count() > 0 ? `${count()} ` : ""}${language.t(labelKey)}`;
    }
  });

  // One server row (_tmpl$5): health dot + ServerRow + spacer/check icon.
  /**
   * Build one server row (health dot, ServerRow, default badge, active check). Clicking
   * a healthy row navigates home and activates that server; unhealthy rows are disabled.
   * @param {Object} conn - The server connection to render.
   * @returns {Element} The row button element.
   */
  const buildServerRow = conn => {
    const key = ServerConnection.key(conn);
    const blocked = () => health[key]?.healthy === false;
    const row = template(`<button type="button" class="d-flex align-items-center gap-2 w-100 h-8 pl-3 pr-1.5 py-1.5 rounded-2 transition-colors text-left"></button>`);
    row.addEventListener("click", () => {
      if (blocked()) return;
      navigate("/");
      queueMicrotask(() => server.setActive(key));
    });
    row.appendChild(createComponent(ServerHealthIndicator, {
      get health() {
        return health[key];
      }
    }));
    row.appendChild(createComponent(ServerRow, {
      conn: conn,
      get dimmed() {
        return blocked();
      },
      get status() {
        return health[key];
      },
      class: "flex items-center gap-2 w-full min-w-0",
      nameClass: "fw-normal text-body truncate",
      versionClass: "small fw-normal text-secondary truncate",
      // <Show when={key === defaultServer.key()}> default badge </Show>:
      // ServerRow resolves `badge` inside its tracked children() memo, so the
      // defaultServer.key() / language.t reads here stay live.
      get badge() {
        if (key !== defaultServer.key()) return undefined;
        const badge = template(`<span class="small fw-normal text-body bg-body-tertiary px-1.5 py-0.5 rounded-2"></span>`);
        badge.textContent = language.t("common.default");
        return badge;
      },
      // Spacer (_tmpl$4) + <Show when={active}> check icon </Show>. ServerRow
      // re-reads this getter in its children render effect, so the
      // server.current read keeps the check icon live. Concrete nodes only —
      // ServerRow stringifies function array entries.
      get children() {
        const current = server.current;
        const isCurrent = !!current && key === ServerConnection.key(current);
        return [template(`<div class="flex-1"></div>`), isCurrent ? createComponent(Icon, {
          name: "check",
          size: "small",
          class: "text-secondary shrink-0"
        }) : undefined];
      }
    }));
    createEffect(() => {
      const isBlocked = blocked();
      row.classList.toggle("cursor-not-allowed", isBlocked);
      row.setAttribute("aria-disabled", String(isBlocked));
    });
    return row;
  };

  /**
   * Build the "servers" tab content: the health-sorted server rows plus a "manage
   * servers" button that opens the server-selection dialog.
   * @returns {Element} The tab content element.
   */
  const buildServersContent = () => {
    const { outer, body } = buildTabBody();
    const rowsSlot = template(`<div style="display: contents"></div>`);
    const actionSlot = template(`<div style="display: contents"></div>`);
    body.appendChild(rowsSlot);
    body.appendChild(actionSlot);
    // Row list (sorted by health, active first). Rebuilt when the sorted list
    // changes; per-row health flows through component getters. Construction is
    // untracked so component-internal prop reads don't widen this effect.
    createEffect(() => {
      const list = sortedServers();
      rowsSlot.replaceChildren(...list.map(conn => untrack(() => buildServerRow(conn))));
    });
    // "Manage servers" button: the vanilla Button renders children once, so
    // rebuild it whenever the (live) label changes.
    createEffect(() => {
      const label = language.t("status.popover.action.manageServers");
      actionSlot.replaceChildren(createComponent(Button, {
        variant: "secondary",
        class: "mt-3 self-start h-8 px-3 py-1.5",
        onClick: () => {
          const run = ++dialogRun;
          void import("./dialog-select-server.js").then(x => {
            if (dialogDead || dialogRun !== run) return;
            dialog.show(() => createComponent(x.DialogSelectServer, {}), defaultServer.refresh);
          });
        },
        get children() {
          return label;
        }
      }));
    });
    return outer;
  };

  // One MCP row (_tmpl$8): status dot + name + toggle switch.
  /**
   * Build one MCP server row (colored status dot, name, enable/disable Switch). Clicking
   * the row or toggling the switch flips the MCP server; the dot color tracks live status.
   * @param {string} name - The MCP server name.
   * @returns {Element} The row button element.
   */
  const buildMcpRow = name => {
    const status = () => mcpStatus(name);
    const enabled = () => status() === "connected";
    const row = template(`<button type="button" class="d-flex align-items-center gap-2 w-100 h-8 pl-3 pr-2 py-1 rounded-2 transition-colors text-left"><div></div><span class="fw-normal text-body truncate flex-1"></span><div></div></button>`);
    const dot = row.firstElementChild;
    const label = dot.nextElementSibling;
    const control = label.nextElementSibling;
    row.addEventListener("click", () => {
      mcp.toggle(name);
    });
    label.textContent = name;
    // Clicks on the switch cell must not also fire the row toggle.
    control.addEventListener("click", event => event.stopPropagation());
    const switchEl = createComponent(Switch, {
      get checked() {
        return enabled();
      },
      get disabled() {
        return !!mcp.isPending && mcp.pendingName === name;
      },
      onChange: () => {
        mcp.toggle(name);
      }
    });
    control.appendChild(switchEl);
    // The vanilla Switch reads checked/disabled once at creation, but these
    // rows persist across status changes (only the name list rebuilds them) —
    // keep the native checkbox in sync with the live status so row clicks and
    // external updates move the knob like the original reactive Switch did
    // (same pattern as settings-general's switchBox).
    const switchInput = switchEl.querySelector('input[data-slot="input"]');
    createEffect(() => {
      const pending = mcp.isPending && mcp.pendingName === name;
      switchInput.checked = enabled();
      switchInput.disabled = pending;
      row.disabled = pending;
      applyClassList(dot, {
        "size-1.5 rounded-circle shrink-0": true,
        "bg-success": status() === "connected",
        "bg-danger": status() === "failed",
        "bg-secondary": status() === "disabled",
        "bg-warning": status() === "needs_auth" || status() === "needs_client_registration"
      });
    });
    return row;
  };

  /**
   * Build the "MCP" tab content: a row per configured MCP server, or an empty state.
   * @returns {Element} The tab content element.
   */
  const buildMcpContent = () => {
    const { outer, body } = buildTabBody();
    createEffect(() => {
      const names = mcpNames();
      if (names.length === 0) {
        body.replaceChildren(buildEmpty(() => language.t("dialog.mcp.empty")));
        return;
      }
      body.replaceChildren(...names.map(name => untrack(() => buildMcpRow(name))));
    });
    return outer;
  };

  // One LSP row (_tmpl$9): item is a store proxy, so name/status stay live.
  /**
   * Build one LSP server row (status dot + name). The item is a store proxy, so its
   * name and status stay live via render effects.
   * @param {Object} item - The LSP server record ({name, id, status}).
   * @returns {Element} The row element.
   */
  const buildLspRow = item => {
    const row = template(`<div class="d-flex align-items-center gap-2 w-100 px-2 py-1"><div></div><span class="fw-normal text-body truncate"></span></div>`);
    const dot = row.firstElementChild;
    const label = dot.nextElementSibling;
    createRenderEffect(() => {
      label.textContent = item.name || item.id;
    });
    createRenderEffect(() => {
      applyClassList(dot, {
        "size-1.5 rounded-circle shrink-0": true,
        "bg-success": item.status === "connected",
        "bg-danger": item.status === "error"
      });
    });
    return row;
  };

  /**
   * Build the "LSP" tab content: a row per LSP server, or an empty state.
   * @returns {Element} The tab content element.
   */
  const buildLspContent = () => {
    const { outer, body } = buildTabBody();
    createEffect(() => {
      const items = lspItems();
      if (items.length === 0) {
        body.replaceChildren(buildEmpty(() => language.t("dialog.lsp.empty")));
        return;
      }
      // .map over the (possibly store-backed) array keeps length/index reads
      // tracked like <For>; row construction itself is untracked.
      body.replaceChildren(...items.map(item => untrack(() => buildLspRow(item))));
    });
    return outer;
  };

  // One plugin row (_tmpl$0): static green dot + plugin name.
  /**
   * Build one plugin row (static green dot + plugin name).
   * @param {string} plugin - The plugin name.
   * @returns {Element} The row element.
   */
  const buildPluginRow = plugin => {
    const row = template(`<div class="d-flex align-items-center gap-2 w-100 px-2 py-1"><div class="size-1.5 rounded-circle shrink-0 bg-success"></div><span class="fw-normal text-body truncate"></span></div>`);
    row.lastElementChild.textContent = plugin;
    return row;
  };

  /**
   * Build the "plugins" tab content: a row per plugin, or an empty state with the
   * config file name in a <code> chip.
   * @returns {Element} The tab content element.
   */
  const buildPluginsContent = () => {
    const { outer, body } = buildTabBody();
    createEffect(() => {
      const list = plugins();
      if (list.length === 0) {
        const empty = template(`<div class="fw-normal text-body text-center my-auto"></div>`);
        createRenderEffect(() => {
          empty.replaceChildren(...pluginEmpty());
        });
        body.replaceChildren(empty);
        return;
      }
      body.replaceChildren(...list.map(plugin => untrack(() => buildPluginRow(plugin))));
    });
    return outer;
  };

  // Root (_tmpl$3) hosting the Tabs component. NOTE: the compiled output also
  // passed "data-slot": "tablist"/"tab" through to Tabs.List/Tabs.Trigger;
  // with the bs Tabs those would override the internal data-slot markers its
  // selection sync and click delegation rely on (no CSS targets them), so
  // they are intentionally not forwarded. "data-component" is already set by
  // the Tabs root itself.
  const root = template(`<div class="d-flex align-items-center gap-1 w-[360px] rounded-3 shadow-[var(--shadow-lg-border-base)]"></div>`);
  root.appendChild(createComponent(Tabs, {
    get ["aria-label"]() {
      return language.t("status.popover.ariaLabel");
    },
    class: "tabs bg-body rounded-3 overflow-hidden",
    "data-active": "servers",
    defaultValue: "servers",
    variant: "alt",
    get children() {
      return [createComponent(Tabs.List, {
        class: "bg-transparent border-b-0 px-4 pt-2 pb-0 gap-4 h-10",
        get children() {
          return [
            buildTrigger("servers", () => sortedServers().length, "status.popover.tab.servers"),
            buildTrigger("mcp", mcpConnected, "status.popover.tab.mcp"),
            buildTrigger("lsp", lspCount, "status.popover.tab.lsp"),
            buildTrigger("plugins", pluginCount, "status.popover.tab.plugins")
          ];
        }
      }), createComponent(Tabs.Content, {
        value: "servers",
        get children() {
          return buildServersContent();
        }
      }), createComponent(Tabs.Content, {
        value: "mcp",
        get children() {
          return buildMcpContent();
        }
      }), createComponent(Tabs.Content, {
        value: "lsp",
        get children() {
          return buildLspContent();
        }
      }), createComponent(Tabs.Content, {
        value: "plugins",
        get children() {
          return buildPluginsContent();
        }
      })];
    }
  }));
  return root;
}
