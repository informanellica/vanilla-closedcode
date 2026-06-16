/** @file Layout context: persisted UI layout state (sidebar/terminal/review/file-tree/chat panel sizes and open state), project list enrichment with avatar colors, per-session tabs/scroll/view state with LRU pruning, and the shared file-editor toggle. */
import { createStore, produce } from "../lib/store.js";
import { batch, createEffect, createMemo, onCleanup, onMount } from "../lib/reactivity.js";
import { createSimpleContext } from "@/lib/context.js";
import { makeEventListener } from "../lib/primitives/event-listener.js";
import { useGlobalSync } from "./global-sync.js";
import { useGlobalSDK } from "./global-sdk.js";
import { useServer } from "./server.js";
import { usePlatform } from "./platform.js";
import { Persist, persisted, removePersisted } from "@/utils/persist.js";
import { decode64 } from "@/utils/base64.js";
import { same } from "@/utils/same.js";
import { createScrollPersistence } from "./layout-scroll.js";
import { createPathHelpers } from "./file/path.js";
const AVATAR_COLOR_KEYS = ["pink", "mint", "orange", "purple", "cyan", "lime"];
const DEFAULT_SIDEBAR_WIDTH = 344;
const DEFAULT_FILE_TREE_WIDTH = 200;
const DEFAULT_SESSION_WIDTH = 300;
const DEFAULT_TERMINAL_HEIGHT = 280;
const DEFAULT_CHAT_HEIGHT = 300;
/**
 * Resolve the background/foreground CSS variables for an avatar color key, falling back to the info surface.
 * @param {string} key - The avatar color key (one of AVATAR_COLOR_KEYS) or falsy.
 * @returns {Object} An object {background, foreground} of CSS variable references.
 */
export function getAvatarColors(key) {
  if (key && AVATAR_COLOR_KEYS.includes(key)) {
    return {
      background: `var(--avatar-background-${key})`,
      foreground: `var(--avatar-text-${key})`
    };
  }
  return {
    background: "var(--surface-info-base)",
    foreground: "var(--text-base)"
  };
}
/**
 * Mark a session key as used and seed its dependent state, returning the key.
 * @param {string} key - The session key.
 * @param {Function} touch - Marks the key as recently used (drives LRU pruning).
 * @param {Function} seed - Seeds dependent state (e.g. scroll persistence) for the key.
 * @returns {string} The same session key.
 */
export function ensureSessionKey(key, touch, seed) {
  touch(key);
  seed(key);
  return key;
}
/**
 * Build a reader that resolves a session key (from a value or accessor) and ensures it is registered on read.
 * @param {*} sessionKey - The session key, or a zero-argument accessor returning it.
 * @param {Function} ensure - Called with the resolved key to register/seed it before returning.
 * @returns {Function} A reader returning the ensured session key.
 */
export function createSessionKeyReader(sessionKey, ensure) {
  const key = typeof sessionKey === "function" ? sessionKey : () => sessionKey;
  return () => {
    const value = key();
    ensure(value);
    return value;
  };
}
/**
 * Determine which session keys to drop when the tracked-session count exceeds the limit, keeping the
 * most recently used and never dropping the protected `keep` key.
 * @param {Object} input - {keep (protected key), max (limit), used (key->timestamp Map), view (Array of keys), tabs (Array of keys)}.
 * @returns {Array} The session keys to drop (least-recently-used beyond the limit).
 */
export function pruneSessionKeys(input) {
  if (!input.keep) return [];
  const keys = new Set([...input.view, ...input.tabs]);
  if (keys.size <= input.max) return [];
  const score = key => {
    if (key === input.keep) return Number.MAX_SAFE_INTEGER;
    return input.used.get(key) ?? 0;
  };
  return Array.from(keys).sort((a, b) => score(b) - score(a)).slice(input.max);
}
/**
 * Compute the next session-tabs state when opening a tab: "review" is removed and activated, "context"
 * is moved to the front, other tabs are appended if absent; the opened tab becomes active.
 * @param {Object} current - The current {all, active} tabs state (may be undefined).
 * @param {string} tab - The tab being opened.
 * @returns {Object} The next {all, active} tabs state.
 */
function nextSessionTabsForOpen(current, tab) {
  const all = current?.all ?? [];
  if (tab === "review") return {
    all: all.filter(x => x !== "review"),
    active: tab
  };
  if (tab === "context") return {
    all: [tab, ...all.filter(x => x !== tab)],
    active: tab
  };
  if (!all.includes(tab)) return {
    all: [...all, tab],
    active: tab
  };
  return {
    all,
    active: tab
  };
}
/**
 * Build the path helpers for the directory encoded in a session key, or undefined when undecodable.
 * @param {string} key - The session key ("<base64dir>/<id>" style).
 * @returns {Object} The path helpers for the session's root directory, or undefined.
 */
const sessionPath = key => {
  const dir = key.split("/")[0];
  if (!dir) return;
  const root = decode64(dir);
  if (!root) return;
  return createPathHelpers(() => root);
};
/**
 * Normalize a single session tab id, canonicalizing file:// tabs via the session's path helpers.
 * @param {Object} path - The session path helpers (or undefined to skip normalization).
 * @param {string} tab - The tab id.
 * @returns {string} The normalized tab id.
 */
const normalizeSessionTab = (path, tab) => {
  if (!tab.startsWith("file://")) return tab;
  if (!path) return tab;
  return path.tab(tab);
};
/**
 * Normalize a list of session tab ids and drop duplicates, preserving order.
 * @param {Object} path - The session path helpers.
 * @param {Array} all - The tab ids to normalize.
 * @returns {Array} The de-duplicated, normalized tab ids.
 */
const normalizeSessionTabList = (path, all) => {
  const seen = new Set();
  return all.flatMap(tab => {
    const value = normalizeSessionTab(path, tab);
    if (seen.has(value)) return [];
    seen.add(value);
    return [value];
  });
};
/**
 * Normalize a stored session-tabs record (all list + active tab) for a given session key.
 * @param {string} key - The session key (used to resolve the directory's path helpers).
 * @param {Object} tabs - The stored {all, active} record.
 * @returns {Object} The normalized {all, active} record.
 */
const normalizeStoredSessionTabs = (key, tabs) => {
  const path = sessionPath(key);
  return {
    all: normalizeSessionTabList(path, tabs.all),
    active: tabs.active ? normalizeSessionTab(path, tabs.active) : tabs.active
  };
};
/**
 * Layout context. Provides `useLayout` (consumer) and `LayoutProvider`. Manages persisted UI layout
 * state (sidebar, terminal, review panel, file tree, chat panel — sizes and open/closed state) with
 * version migration, the enriched project list (avatar colors and icon overrides), per-session tabs,
 * scroll, view state, and pending-message tracking with LRU pruning, plus a shared file-editor
 * controller for the global toolbar.
 */
export const {
  use: useLayout,
  provider: LayoutProvider
} = createSimpleContext({
  name: "Layout",
  init: () => {
    const globalSdk = useGlobalSDK();
    const globalSync = useGlobalSync();
    const server = useServer();
    const platform = usePlatform();
    /**
     * Whether a value is a plain (non-array) object record.
     * @param {*} value - The value to test.
     * @returns {boolean} True for non-null, non-array objects.
     */
    const isRecord = value => typeof value === "object" && value !== null && !Array.isArray(value);
    /**
     * Migrate a persisted layout value across schema versions (sidebar workspaces, review panel, file tree,
     * session tabs normalization, review-panel width, and chat panel), returning the original when unchanged.
     * @param {*} value - The previously persisted layout value.
     * @returns {*} The migrated layout value (or the original when no migration applied).
     */
    const migrate = value => {
      if (!isRecord(value)) return value;
      const sidebar = value.sidebar;
      const migratedSidebar = (() => {
        if (!isRecord(sidebar)) return sidebar;
        if (typeof sidebar.workspaces !== "boolean") return sidebar;
        return {
          ...sidebar,
          workspaces: {},
          workspacesDefault: sidebar.workspaces
        };
      })();
      const review = value.review;
      const fileTree = value.fileTree;
      const migratedFileTree = (() => {
        if (!isRecord(fileTree)) return fileTree;
        if (fileTree.tab === "changes" || fileTree.tab === "all") return fileTree;
        const width = typeof fileTree.width === "number" ? fileTree.width : DEFAULT_FILE_TREE_WIDTH;
        return {
          ...fileTree,
          opened: true,
          width: width === 260 ? DEFAULT_FILE_TREE_WIDTH : width,
          tab: "changes"
        };
      })();
      const migratedReview = (() => {
        if (!isRecord(review)) return review;
        if (typeof review.panelOpened === "boolean") return review;
        const opened = isRecord(fileTree) && typeof fileTree.opened === "boolean" ? fileTree.opened : true;
        return {
          ...review,
          panelOpened: opened
        };
      })();
      const sessionTabs = value.sessionTabs;
      const migratedSessionTabs = (() => {
        if (!isRecord(sessionTabs)) return sessionTabs;
        let changed = false;
        const next = Object.fromEntries(Object.entries(sessionTabs).map(([key, tabs]) => {
          if (!isRecord(tabs) || !Array.isArray(tabs.all)) return [key, tabs];
          const current = {
            all: tabs.all.filter(tab => typeof tab === "string"),
            active: typeof tabs.active === "string" ? tabs.active : undefined
          };
          const normalized = normalizeStoredSessionTabs(key, current);
          if (current.all.length !== tabs.all.length) changed = true;
          if (!same(current.all, normalized.all) || current.active !== normalized.active) changed = true;
          if (tabs.active !== undefined && typeof tabs.active !== "string") changed = true;
          return [key, normalized];
        }));
        if (!changed) return sessionTabs;
        return next;
      })();
      const session = value.session;
      const migratedSession = (() => {
        if (!isRecord(session)) return session;
        const width = typeof session.width === "number" ? session.width : DEFAULT_SESSION_WIDTH;
        // session.width is the RIGHT review-panel width. Reset legacy oversized
        // values (it used to be the 600px CENTER width) AND the too-narrow 240
        // we briefly shipped (the diff toolbar Unified/Split/Expand was clipped)
        // so the default lands at a width where the toolbar fits. Still resizable.
        return (width >= 400 || width < 260) ? { ...session, width: DEFAULT_SESSION_WIDTH } : session;
      })();
      const chatPanel = value.chatPanel;
      const migratedChatPanel = (() => {
        if (!isRecord(chatPanel)) return chatPanel;
        const height = typeof chatPanel.height === "number" && chatPanel.height >= 120 ? chatPanel.height : DEFAULT_CHAT_HEIGHT;
        return { ...chatPanel, height, opened: true };
      })();
      if (migratedSidebar === sidebar && migratedReview === review && migratedFileTree === fileTree && migratedSessionTabs === sessionTabs && migratedSession === session && migratedChatPanel === chatPanel) {
        return value;
      }
      return {
        ...value,
        sidebar: migratedSidebar,
        review: migratedReview,
        fileTree: migratedFileTree,
        sessionTabs: migratedSessionTabs,
        session: migratedSession,
        chatPanel: migratedChatPanel
      };
    };
    const target = Persist.global("layout", ["layout.v7", "layout.v6"]);
    const [store, setStore, _, ready] = persisted({
      ...target,
      migrate
    }, createStore({
      sidebar: {
        opened: false,
        width: DEFAULT_SIDEBAR_WIDTH,
        workspaces: {},
        workspacesDefault: false
      },
      terminal: {
        height: DEFAULT_TERMINAL_HEIGHT,
        opened: false
      },
      review: {
        diffStyle: "split",
        panelOpened: true
      },
      fileTree: {
        opened: false,
        width: DEFAULT_FILE_TREE_WIDTH,
        tab: "changes"
      },
      chatPanel: {
        height: DEFAULT_CHAT_HEIGHT,
        opened: true
      },
      session: {
        width: DEFAULT_SESSION_WIDTH
      },
      mobileSidebar: {
        opened: false
      },
      sessionTabs: {},
      sessionView: {},
      handoff: {
        tabs: undefined
      }
    }));
    const MAX_SESSION_KEYS = 50;
    const PENDING_MESSAGE_TTL_MS = 2 * 60 * 1000;
    const usage = {
      active: undefined,
      pruned: false,
      used: new Map()
    };
    const SESSION_STATE_KEYS = [{
      key: "prompt",
      legacy: "prompt",
      version: "v2"
    }, {
      key: "terminal",
      legacy: "terminal",
      version: "v1"
    }, {
      key: "file-view",
      legacy: "file",
      version: "v1"
    }];
    /**
     * Remove all persisted per-session/workspace state (prompt, terminal, file-view, and legacy keys) for the given keys.
     * @param {Array} keys - The session keys ("<dir>/<session>" or "<dir>") to drop state for.
     * @returns {void}
     */
    const dropSessionState = keys => {
      for (const key of keys) {
        const parts = key.split("/");
        const dir = parts[0];
        const session = parts[1];
        if (!dir) continue;
        for (const entry of SESSION_STATE_KEYS) {
          const target = session ? Persist.session(dir, session, entry.key) : Persist.workspace(dir, entry.key);
          void removePersisted(target, platform);
          const legacyKey = `${dir}/${entry.legacy}${session ? "/" + session : ""}.${entry.version}`;
          void removePersisted({
            key: legacyKey
          }, platform);
        }
      }
    };
    /**
     * Drop least-recently-used session view/tab state beyond the max, keeping the protected key resident.
     * @param {string} keep - The session key that must be retained.
     * @returns {void}
     */
    function prune(keep) {
      const drop = pruneSessionKeys({
        keep,
        max: MAX_SESSION_KEYS,
        used: usage.used,
        view: Object.keys(store.sessionView),
        tabs: Object.keys(store.sessionTabs)
      });
      if (drop.length === 0) return;
      setStore(produce(draft => {
        for (const key of drop) {
          delete draft.sessionView[key];
          delete draft.sessionTabs[key];
        }
      }));
      scroll.drop(drop);
      dropSessionState(drop);
      for (const key of drop) {
        usage.used.delete(key);
      }
    }
    /**
     * Record a session key as the active/most-recently-used one, triggering a one-time prune once ready.
     * @param {string} sessionKey - The session key being touched.
     * @returns {void}
     */
    function touch(sessionKey) {
      usage.active = sessionKey;
      usage.used.set(sessionKey, Date.now());
      if (!ready()) return;
      if (usage.pruned) return;
      usage.pruned = true;
      prune(sessionKey);
    }
    const scroll = createScrollPersistence({
      debounceMs: 250,
      getSnapshot: sessionKey => store.sessionView[sessionKey]?.scroll,
      onFlush: (sessionKey, next) => {
        const current = store.sessionView[sessionKey];
        const keep = usage.active ?? sessionKey;
        if (!current) {
          setStore("sessionView", sessionKey, {
            scroll: next
          });
          prune(keep);
          return;
        }
        setStore("sessionView", sessionKey, "scroll", prev => ({
          ...prev,
          ...next
        }));
        prune(keep);
      }
    });
    /**
     * Ensure a session key is touched and its scroll state seeded.
     * @param {string} key - The session key.
     * @returns {string} The same session key.
     */
    const ensureKey = key => ensureSessionKey(key, touch, sessionKey => scroll.seed(sessionKey));
    createEffect(() => {
      if (!ready()) return;
      if (usage.pruned) return;
      const active = usage.active;
      if (!active) return;
      usage.pruned = true;
      prune(active);
    });
    onMount(() => {
      const flush = () => batch(() => scroll.flushAll());
      const handleVisibility = () => {
        if (document.visibilityState !== "hidden") return;
        flush();
      };
      makeEventListener(window, "pagehide", flush);
      makeEventListener(document, "visibilitychange", handleVisibility);
      onCleanup(() => {
        scroll.dispose();
      });
    });
    const [colors, setColors] = createStore({});
    const colorRequested = new Map();
    /**
     * Pick an avatar color key not already in use, or a random one when all are taken.
     * @param {Set} used - Set of color keys currently in use.
     * @returns {string} An available (or random fallback) avatar color key.
     */
    function pickAvailableColor(used) {
      const available = AVATAR_COLOR_KEYS.filter(c => !used.has(c));
      if (available.length === 0) return AVATAR_COLOR_KEYS[Math.floor(Math.random() * AVATAR_COLOR_KEYS.length)];
      return available[Math.floor(Math.random() * available.length)];
    }
    /**
     * Enrich a project with its synced metadata and any per-workspace local icon override.
     * @param {Object} project - The project (with at least a worktree).
     * @returns {Object} The project merged with metadata and a local icon override when present.
     */
    function enrich(project) {
      const [childStore] = globalSync.child(project.worktree, {
        bootstrap: false
      });
      const projectID = childStore.project;
      const metadata = projectID ? globalSync.data.project.find(x => x.id === projectID) : globalSync.data.project.find(x => x.worktree === project.worktree);

      // Preserve local icon override from per-workspace localStorage cache (childStore.icon).
      // Without this, different subdirectories of the same git repo would share the same
      // icon from the database instead of using their individual overrides.
      const base = {
        ...metadata,
        ...project
      };
      if (childStore.icon) {
        return {
          ...base,
          icon: {
            ...base.icon,
            override: childStore.icon
          }
        };
      }
      return base;
    }
    const roots = createMemo(() => {
      const map = new Map();
      for (const project of globalSync.data.project) {
        const sandboxes = project.sandboxes ?? [];
        for (const sandbox of sandboxes) {
          map.set(sandbox, project.worktree);
        }
      }
      return map;
    });
    /**
     * Resolve a directory to its top-level project root by walking the sandbox->worktree chain (cycle-safe).
     * @param {string} directory - The directory to resolve.
     * @returns {string} The resolved root directory (the input itself when no mapping or on a cycle).
     */
    const rootFor = directory => {
      const map = roots();
      if (map.size === 0) return directory;
      const visited = new Set();
      const chain = [directory];
      while (chain.length) {
        const current = chain[chain.length - 1];
        if (!current) return directory;
        const next = map.get(current);
        if (!next) return current;
        if (visited.has(next)) return directory;
        visited.add(next);
        chain.push(next);
      }
      return directory;
    };
    createEffect(() => {
      const projects = server.projects.list();
      const seen = new Set(projects.map(project => project.worktree));
      batch(() => {
        for (const project of projects) {
          const root = rootFor(project.worktree);
          if (root === project.worktree) continue;
          server.projects.close(project.worktree);
          if (!seen.has(root)) {
            server.projects.open(root);
            seen.add(root);
          }
          if (project.expanded) server.projects.expand(root);
        }
      });
    });
    const enriched = createMemo(() => server.projects.list().map(enrich));
    const list = createMemo(() => {
      const projects = enriched();
      return projects.map(project => {
        const color = project.icon?.color ?? colors[project.worktree];
        if (!color) return project;
        const icon = project.icon ? {
          ...project.icon,
          color
        } : {
          color
        };
        return {
          ...project,
          icon
        };
      });
    });
    createEffect(() => {
      const projects = enriched();
      if (projects.length === 0) return;
      if (!globalSync.ready) return;
      for (const project of projects) {
        if (!project.id) continue;
        if (project.id === "global") continue;
        globalSync.project.icon(project.worktree, project.icon?.override);
      }
    });
    createEffect(() => {
      const projects = enriched();
      if (projects.length === 0) return;
      for (const project of projects) {
        if (project.icon?.color) colorRequested.delete(project.worktree);
      }
      const used = new Set();
      for (const project of projects) {
        const color = project.icon?.color ?? colors[project.worktree];
        if (color) used.add(color);
      }
      for (const project of projects) {
        if (project.icon?.color || project.icon?.override || project.icon?.url) continue;
        const worktree = project.worktree;
        const existing = colors[worktree];
        const color = existing ?? pickAvailableColor(used);
        if (!existing) {
          used.add(color);
          setColors(worktree, color);
        }
        if (!project.id) continue;
        const requested = colorRequested.get(worktree);
        if (requested === color) continue;
        colorRequested.set(worktree, color);
        if (project.id === "global") {
          globalSync.project.meta(worktree, {
            icon: {
              color
            }
          });
          continue;
        }
        void globalSdk.client.project.update({
          projectID: project.id,
          directory: worktree,
          icon: {
            color
          }
        }).catch(() => {
          if (colorRequested.get(worktree) === color) colorRequested.delete(worktree);
        });
      }
    });
    let sessionFrame;
    let sessionTimer;
    onMount(() => {
      sessionFrame = requestAnimationFrame(() => {
        sessionFrame = undefined;
        sessionTimer = window.setTimeout(() => {
          sessionTimer = undefined;
          void Promise.all(server.projects.list().map(project => {
            return globalSync.project.loadSessions(project.worktree);
          }));
        }, 0);
      });
    });
    onCleanup(() => {
      if (sessionFrame !== undefined) cancelAnimationFrame(sessionFrame);
      if (sessionTimer !== undefined) window.clearTimeout(sessionTimer);
    });
    // Active file editor view/edit mode, shared so the global toolbar can show
    // a mode-aware toggle. Only one file editor is mounted at a time (keyed),
    // so it registers its toggle here on mount and clears it on cleanup.
    const editor = (() => {
      const [st, setSt] = createStore({
        canEdit: false,
        editing: false,
        dirty: false,
        info: null
      });
      let toggleImpl = null;
      let undoImpl = null;
      let redoImpl = null;
      let saveImpl = null;
      let cutImpl = null;
      let copyImpl = null;
      let pasteImpl = null;
      return {
        canEdit: createMemo(() => st.canEdit),
        editing: createMemo(() => st.editing),
        dirty: createMemo(() => st.dirty),
        info: createMemo(() => st.info),
        set(next) {
          setSt(next);
        },
        setDirty(v) {
          setSt("dirty", !!v);
        },
        setInfo(v) {
          setSt("info", v);
        },
        bindToggle(fn) {
          toggleImpl = fn;
        },
        bindUndo(fn) {
          undoImpl = fn;
        },
        bindRedo(fn) {
          redoImpl = fn;
        },
        bindSave(fn) {
          saveImpl = fn;
        },
        bindCut(fn) {
          cutImpl = fn;
        },
        bindCopy(fn) {
          copyImpl = fn;
        },
        bindPaste(fn) {
          pasteImpl = fn;
        },
        toggle() {
          toggleImpl?.();
        },
        undo() {
          undoImpl?.();
        },
        redo() {
          redoImpl?.();
        },
        save() {
          saveImpl?.();
        },
        cut() {
          cutImpl?.();
        },
        copy() {
          copyImpl?.();
        },
        paste() {
          pasteImpl?.();
        }
      };
    })();
    return {
      ready,
      editor,
      handoff: {
        tabs: createMemo(() => store.handoff?.tabs),
        setTabs(dir, id) {
          setStore("handoff", "tabs", {
            dir,
            id,
            at: Date.now()
          });
        },
        clearTabs() {
          if (!store.handoff?.tabs) return;
          setStore("handoff", "tabs", undefined);
        }
      },
      projects: {
        list,
        open(directory) {
          const root = rootFor(directory);
          if (server.projects.list().find(x => x.worktree === root)) return;
          void globalSync.project.loadSessions(root);
          server.projects.open(root);
        },
        close(directory) {
          server.projects.close(directory);
        },
        expand(directory) {
          server.projects.expand(directory);
        },
        collapse(directory) {
          server.projects.collapse(directory);
        },
        move(directory, toIndex) {
          server.projects.move(directory, toIndex);
        }
      },
      sidebar: {
        opened: createMemo(() => store.sidebar.opened),
        open() {
          setStore("sidebar", "opened", true);
        },
        close() {
          setStore("sidebar", "opened", false);
        },
        toggle() {
          setStore("sidebar", "opened", x => !x);
        },
        width: createMemo(() => store.sidebar.width),
        resize(width) {
          setStore("sidebar", "width", width);
        },
        workspaces(directory) {
          return () => store.sidebar.workspaces[directory] ?? store.sidebar.workspacesDefault ?? false;
        },
        setWorkspaces(directory, value) {
          setStore("sidebar", "workspaces", directory, value);
        },
        toggleWorkspaces(directory) {
          const current = store.sidebar.workspaces[directory] ?? store.sidebar.workspacesDefault ?? false;
          setStore("sidebar", "workspaces", directory, !current);
        }
      },
      terminal: {
        height: createMemo(() => store.terminal.height),
        resize(height) {
          setStore("terminal", "height", height);
        }
      },
      chatPanel: {
        height: createMemo(() => store.chatPanel?.height ?? DEFAULT_CHAT_HEIGHT),
        opened: createMemo(() => store.chatPanel?.opened ?? true),
        resize(height) {
          if (!store.chatPanel) {
            setStore("chatPanel", { height, opened: true });
            return;
          }
          setStore("chatPanel", "height", height);
        },
        open() {
          if (!store.chatPanel) {
            setStore("chatPanel", { height: DEFAULT_CHAT_HEIGHT, opened: true });
            return;
          }
          setStore("chatPanel", "opened", true);
        },
        close() {
          if (!store.chatPanel) {
            setStore("chatPanel", { height: DEFAULT_CHAT_HEIGHT, opened: false });
            return;
          }
          setStore("chatPanel", "opened", false);
        },
        toggle() {
          if (!store.chatPanel) {
            setStore("chatPanel", { height: DEFAULT_CHAT_HEIGHT, opened: true });
            return;
          }
          setStore("chatPanel", "opened", x => !x);
        }
      },
      review: {
        diffStyle: createMemo(() => store.review?.diffStyle ?? "split"),
        setDiffStyle(diffStyle) {
          if (!store.review) {
            setStore("review", {
              diffStyle,
              panelOpened: true
            });
            return;
          }
          setStore("review", "diffStyle", diffStyle);
        },
        panelOpened: createMemo(() => store.review?.panelOpened ?? true),
        openPanel() {
          if (!store.review) {
            setStore("review", { diffStyle: "split", panelOpened: true });
            return;
          }
          setStore("review", "panelOpened", true);
        },
        closePanel() {
          if (!store.review) {
            setStore("review", { diffStyle: "split", panelOpened: false });
            return;
          }
          setStore("review", "panelOpened", false);
        },
        togglePanel() {
          if (!store.review) {
            setStore("review", { diffStyle: "split", panelOpened: true });
            return;
          }
          setStore("review", "panelOpened", x => !x);
        }
      },
      fileTree: {
        opened: createMemo(() => store.fileTree?.opened ?? true),
        width: createMemo(() => store.fileTree?.width ?? DEFAULT_FILE_TREE_WIDTH),
        tab: createMemo(() => store.fileTree?.tab ?? "changes"),
        setTab(tab) {
          if (!store.fileTree) {
            setStore("fileTree", {
              opened: true,
              width: DEFAULT_FILE_TREE_WIDTH,
              tab
            });
            return;
          }
          setStore("fileTree", "tab", tab);
        },
        open() {
          if (!store.fileTree) {
            setStore("fileTree", {
              opened: true,
              width: DEFAULT_FILE_TREE_WIDTH,
              tab: "changes"
            });
            return;
          }
          setStore("fileTree", "opened", true);
        },
        close() {
          if (!store.fileTree) {
            setStore("fileTree", {
              opened: false,
              width: DEFAULT_FILE_TREE_WIDTH,
              tab: "changes"
            });
            return;
          }
          setStore("fileTree", "opened", false);
        },
        toggle() {
          if (!store.fileTree) {
            setStore("fileTree", {
              opened: true,
              width: DEFAULT_FILE_TREE_WIDTH,
              tab: "changes"
            });
            return;
          }
          setStore("fileTree", "opened", x => !x);
        },
        resize(width) {
          if (!store.fileTree) {
            setStore("fileTree", {
              opened: true,
              width,
              tab: "changes"
            });
            return;
          }
          setStore("fileTree", "width", width);
        }
      },
      session: {
        width: createMemo(() => store.session?.width ?? DEFAULT_SESSION_WIDTH),
        resize(width) {
          if (!store.session) {
            setStore("session", {
              width
            });
            return;
          }
          setStore("session", "width", width);
        }
      },
      mobileSidebar: {
        opened: createMemo(() => store.mobileSidebar?.opened ?? false),
        show() {
          setStore("mobileSidebar", "opened", true);
        },
        hide() {
          setStore("mobileSidebar", "opened", false);
        },
        toggle() {
          setStore("mobileSidebar", "opened", x => !x);
        }
      },
      pendingMessage: {
        set(sessionKey, messageID) {
          const at = Date.now();
          touch(sessionKey);
          const current = store.sessionView[sessionKey];
          if (!current) {
            setStore("sessionView", sessionKey, {
              scroll: {},
              pendingMessage: messageID,
              pendingMessageAt: at
            });
            prune(usage.active ?? sessionKey);
            return;
          }
          setStore("sessionView", sessionKey, produce(draft => {
            draft.pendingMessage = messageID;
            draft.pendingMessageAt = at;
          }));
        },
        consume(sessionKey) {
          const current = store.sessionView[sessionKey];
          const message = current?.pendingMessage;
          const at = current?.pendingMessageAt;
          if (!message || !at) return;
          setStore("sessionView", sessionKey, produce(draft => {
            delete draft.pendingMessage;
            delete draft.pendingMessageAt;
          }));
          if (Date.now() - at > PENDING_MESSAGE_TTL_MS) return;
          return message;
        }
      },
      view(sessionKey) {
        const key = createSessionKeyReader(sessionKey, ensureKey);
        const s = createMemo(() => store.sessionView[key()] ?? {
          scroll: {}
        });
        const terminalOpened = createMemo(() => store.terminal?.opened ?? false);
        const reviewPanelOpened = createMemo(() => store.review?.panelOpened ?? true);
        const chatPanelOpened = createMemo(() => store.chatPanel?.opened ?? true);
        function setChatPanelOpened(next) {
          const current = store.chatPanel;
          if (!current) {
            setStore("chatPanel", { height: DEFAULT_CHAT_HEIGHT, opened: next });
            return;
          }
          const value = current.opened ?? true;
          if (value === next) return;
          setStore("chatPanel", "opened", next);
        }
        function setTerminalOpened(next) {
          const current = store.terminal;
          if (!current) {
            setStore("terminal", {
              height: DEFAULT_TERMINAL_HEIGHT,
              opened: next
            });
            return;
          }
          const value = current.opened ?? false;
          if (value === next) return;
          setStore("terminal", "opened", next);
        }
        function setReviewPanelOpened(next) {
          const current = store.review;
          if (!current) {
            setStore("review", {
              diffStyle: "split",
              panelOpened: next
            });
            return;
          }
          const value = current.panelOpened ?? true;
          if (value === next) return;
          setStore("review", "panelOpened", next);
        }
        return {
          scroll(tab) {
            return scroll.scroll(key(), tab);
          },
          setScroll(tab, pos) {
            scroll.setScroll(key(), tab, pos);
          },
          terminal: {
            opened: terminalOpened,
            open() {
              setTerminalOpened(true);
            },
            close() {
              setTerminalOpened(false);
            },
            toggle() {
              setTerminalOpened(!terminalOpened());
            }
          },
          reviewPanel: {
            opened: reviewPanelOpened,
            open() {
              setReviewPanelOpened(true);
            },
            close() {
              setReviewPanelOpened(false);
            },
            toggle() {
              setReviewPanelOpened(!reviewPanelOpened());
            }
          },
          chatPanel: {
            opened: chatPanelOpened,
            open() {
              setChatPanelOpened(true);
            },
            close() {
              setChatPanelOpened(false);
            },
            toggle() {
              setChatPanelOpened(!chatPanelOpened());
            }
          },
          review: {
            open: createMemo(() => s().reviewOpen ?? []),
            setOpen(open) {
              const session = key();
              const next = Array.from(new Set(open));
              const current = store.sessionView[session];
              if (!current) {
                setStore("sessionView", session, {
                  scroll: {},
                  reviewOpen: next
                });
                return;
              }
              if (same(current.reviewOpen, next)) return;
              setStore("sessionView", session, "reviewOpen", next);
            },
            openPath(path) {
              const session = key();
              const current = store.sessionView[session];
              if (!current) {
                setStore("sessionView", session, {
                  scroll: {},
                  reviewOpen: [path]
                });
                return;
              }
              if (!current.reviewOpen) {
                setStore("sessionView", session, "reviewOpen", [path]);
                return;
              }
              if (current.reviewOpen.includes(path)) return;
              setStore("sessionView", session, "reviewOpen", current.reviewOpen.length, path);
            },
            closePath(path) {
              const session = key();
              const current = store.sessionView[session]?.reviewOpen;
              if (!current) return;
              const index = current.indexOf(path);
              if (index === -1) return;
              setStore("sessionView", session, "reviewOpen", produce(draft => {
                if (!draft) return;
                draft.splice(index, 1);
              }));
            },
            togglePath(path) {
              const session = key();
              const current = store.sessionView[session]?.reviewOpen;
              if (!current || !current.includes(path)) {
                this.openPath(path);
                return;
              }
              this.closePath(path);
            }
          }
        };
      },
      tabs(sessionKey) {
        const key = createSessionKeyReader(sessionKey, ensureKey);
        const path = createMemo(() => sessionPath(key()));
        const tabs = createMemo(() => store.sessionTabs[key()] ?? {
          all: []
        });
        const normalize = tab => normalizeSessionTab(path(), tab);
        const normalizeAll = all => normalizeSessionTabList(path(), all);
        return {
          tabs,
          active: createMemo(() => tabs().active),
          all: createMemo(() => tabs().all.filter(tab => tab !== "review")),
          setActive(tab) {
            const session = key();
            const next = tab ? normalize(tab) : tab;
            if (!store.sessionTabs[session]) {
              setStore("sessionTabs", session, {
                all: [],
                active: next
              });
            } else {
              setStore("sessionTabs", session, "active", next);
            }
          },
          setAll(all) {
            const session = key();
            const next = normalizeAll(all).filter(tab => tab !== "review");
            if (!store.sessionTabs[session]) {
              setStore("sessionTabs", session, {
                all: next,
                active: undefined
              });
            } else {
              setStore("sessionTabs", session, "all", next);
            }
          },
          async open(tab) {
            const session = key();
            const next = nextSessionTabsForOpen(store.sessionTabs[session], normalize(tab));
            setStore("sessionTabs", session, next);
          },
          close(tab) {
            const session = key();
            const current = store.sessionTabs[session];
            if (!current) return;
            if (tab === "review") {
              if (current.active !== tab) return;
              setStore("sessionTabs", session, "active", current.all[0]);
              return;
            }
            const all = current.all.filter(x => x !== tab);
            if (current.active !== tab) {
              setStore("sessionTabs", session, "all", all);
              return;
            }
            const index = current.all.findIndex(f => f === tab);
            const next = current.all[index - 1] ?? current.all[index + 1] ?? all[0];
            batch(() => {
              setStore("sessionTabs", session, "all", all);
              setStore("sessionTabs", session, "active", next);
            });
          },
          move(tab, to) {
            const session = key();
            const current = store.sessionTabs[session];
            if (!current) return;
            const index = current.all.findIndex(f => f === tab);
            if (index === -1) return;
            setStore("sessionTabs", session, "all", produce(opened => {
              opened.splice(to, 0, opened.splice(index, 1)[0]);
            }));
          }
        };
      }
    };
  }
});
