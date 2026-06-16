/** @file Terminal context: workspace-scoped persisted store of PTY tabs (create/clone/move/close/trim) backed by the SDK pty API, surviving session switches within a directory. */
import { createStore, produce } from "../lib/store.js";
import { createSimpleContext } from "@/lib/context.js";
import { batch, createEffect, createMemo, createRoot, on, onCleanup } from "../lib/reactivity.js";
import { useParams } from "../lib/router/index.js";
import { useSDK } from "./sdk.js";
import { defaultTitle, titleNumber } from "./terminal-title.js";
import { Persist, persisted, removePersisted } from "@/utils/persist.js";
const WORKSPACE_KEY = "__workspace__";
const MAX_TERMINAL_SESSIONS = 20;
/**
 * Test whether a value is a plain (non-array) object.
 * @param {*} value - The value to test.
 * @returns {boolean} True if value is a non-null, non-array object.
 */
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
 * Coerce a value to a string, or undefined if not a string.
 * @param {*} value - The value to coerce.
 * @returns {string} The string, or undefined.
 */
function text(value) {
  return typeof value === "string" ? value : undefined;
}
/**
 * Coerce a value to a finite number, or undefined otherwise.
 * @param {*} value - The value to coerce.
 * @returns {number} The finite number, or undefined.
 */
function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
/**
 * Derive a default-title tab number from a title (bounded by the session cap).
 * @param {string} title - The terminal title.
 * @returns {number} The encoded tab number, or undefined.
 */
function numberFromTitle(title) {
  return titleNumber(title, MAX_TERMINAL_SESSIONS);
}
/**
 * Validate and normalize a persisted PTY entry, dropping invalid records and
 * filling a stable title number; optional dimension/buffer fields are included only when present.
 * @param {*} value - The raw persisted PTY value.
 * @returns {Object} A normalized PTY record {id, title, titleNumber, ...optional}, or undefined if invalid.
 */
function pty(value) {
  if (!record(value)) return;
  const id = text(value.id);
  if (!id) return;
  const title = text(value.title) ?? "";
  const number = num(value.titleNumber);
  const rows = num(value.rows);
  const cols = num(value.cols);
  const buffer = text(value.buffer);
  const scrollY = num(value.scrollY);
  const cursor = num(value.cursor);
  return {
    id,
    title,
    titleNumber: number && number > 0 ? number : numberFromTitle(title) ?? 0,
    ...(rows !== undefined ? {
      rows
    } : {}),
    ...(cols !== undefined ? {
      cols
    } : {}),
    ...(buffer !== undefined ? {
      buffer
    } : {}),
    ...(scrollY !== undefined ? {
      scrollY
    } : {}),
    ...(cursor !== undefined ? {
      cursor
    } : {})
  };
}
/**
 * Migrate a persisted terminal state blob into the current shape, deduping PTY
 * ids and clamping the active id to a surviving tab.
 * @param {*} value - The raw persisted state (possibly legacy).
 * @returns {Object} A {active, all} state, or the original value when not a record.
 */
export function migrateTerminalState(value) {
  if (!record(value)) return value;
  const seen = new Set();
  const all = (Array.isArray(value.all) ? value.all : []).flatMap(item => {
    const next = pty(item);
    if (!next || seen.has(next.id)) return [];
    seen.add(next.id);
    return [next];
  });
  const active = text(value.active);
  return {
    active: active && seen.has(active) ? active : all[0]?.id,
    all
  };
}
/**
 * Build the in-memory cache key for a directory's workspace terminal session.
 * @param {string} dir - The workspace directory.
 * @returns {string} The cache key.
 */
export function getWorkspaceTerminalCacheKey(dir) {
  return `${dir}:${WORKSPACE_KEY}`;
}
/**
 * List the legacy persisted-storage keys that may hold pre-workspace terminal state.
 * @param {string} dir - The workspace directory.
 * @param {string} [legacySessionID] - A legacy per-session id, if any.
 * @returns {Array} The candidate legacy storage keys (most specific first).
 */
export function getLegacyTerminalStorageKeys(dir, legacySessionID) {
  if (!legacySessionID) return [`${dir}/terminal.v1`];
  return [`${dir}/terminal/${legacySessionID}.v1`, `${dir}/terminal.v1`];
}
const caches = new Set();
/**
 * Strip the heavy buffer/cursor/scroll fields from a PTY record (for trimming).
 * @param {Object} pty - The PTY record.
 * @returns {Object} The record without buffer/cursor/scrollY, or the same reference if already trimmed.
 */
const trimTerminal = pty => {
  if (!pty.buffer && pty.cursor === undefined && pty.scrollY === undefined) return pty;
  return {
    ...pty,
    buffer: undefined,
    cursor: undefined,
    scrollY: undefined
  };
};
export function clearWorkspaceTerminals(dir, sessionIDs, platform) {
  const key = getWorkspaceTerminalCacheKey(dir);
  for (const cache of caches) {
    const entry = cache.get(key);
    entry?.value.clear();
  }
  void removePersisted(Persist.workspace(dir, "terminal"), platform);
  const legacy = new Set(getLegacyTerminalStorageKeys(dir));
  for (const id of sessionIDs ?? []) {
    for (const key of getLegacyTerminalStorageKeys(dir, id)) {
      legacy.add(key);
    }
  }
  for (const key of legacy) {
    void removePersisted({
      key
    }, platform);
  }
}
function createWorkspaceTerminalSession(sdk, dir, legacySessionID) {
  const legacy = getLegacyTerminalStorageKeys(dir, legacySessionID);
  const [store, setStore, _, ready] = persisted({
    ...Persist.workspace(dir, "terminal", legacy),
    migrate: migrateTerminalState
  }, createStore({
    all: []
  }));
  const pickNextTerminalNumber = () => {
    const existingTitleNumbers = new Set(store.all.flatMap(pty => {
      const direct = Number.isFinite(pty.titleNumber) && pty.titleNumber > 0 ? pty.titleNumber : undefined;
      if (direct !== undefined) return [direct];
      const parsed = numberFromTitle(pty.title);
      if (parsed === undefined) return [];
      return [parsed];
    }));
    return Array.from({
      length: existingTitleNumbers.size + 1
    }, (_, index) => index + 1).find(number => !existingTitleNumbers.has(number)) ?? 1;
  };
  const removeExited = id => {
    const all = store.all;
    const index = all.findIndex(x => x.id === id);
    if (index === -1) return;
    const active = store.active === id ? index === 0 ? all[1]?.id : all[0]?.id : store.active;
    batch(() => {
      setStore("active", active);
      setStore("all", produce(draft => {
        draft.splice(index, 1);
      }));
    });
  };
  const unsub = sdk.event.on("pty.exited", event => {
    removeExited(event.properties.id);
  });
  onCleanup(unsub);
  const update = (client, pty) => {
    const index = store.all.findIndex(x => x.id === pty.id);
    const previous = index >= 0 ? store.all[index] : undefined;
    if (index >= 0) {
      setStore("all", index, item => ({
        ...item,
        ...pty
      }));
    }
    client.pty.update({
      ptyID: pty.id,
      title: pty.title,
      size: pty.cols && pty.rows ? {
        rows: pty.rows,
        cols: pty.cols
      } : undefined
    }).catch(error => {
      if (previous) {
        const currentIndex = store.all.findIndex(item => item.id === pty.id);
        if (currentIndex >= 0) setStore("all", currentIndex, previous);
      }
      console.error("Failed to update terminal", error);
    });
  };
  const clone = async (client, id) => {
    const index = store.all.findIndex(x => x.id === id);
    const pty = store.all[index];
    if (!pty) return;
    const next = await client.pty.create({
      title: pty.title
    }).catch(error => {
      console.error("Failed to clone terminal", error);
      return undefined;
    });
    if (!next?.data) return;
    const active = store.active === pty.id;
    batch(() => {
      setStore("all", index, {
        id: next.data.id,
        title: next.data.title ?? pty.title,
        titleNumber: pty.titleNumber,
        buffer: undefined,
        cursor: undefined,
        scrollY: undefined,
        rows: undefined,
        cols: undefined
      });
      if (active) {
        setStore("active", next.data.id);
      }
    });
  };
  return {
    ready,
    all: createMemo(() => store.all),
    active: createMemo(() => store.active),
    clear() {
      batch(() => {
        setStore("active", undefined);
        setStore("all", []);
      });
    },
    new() {
      const nextNumber = pickNextTerminalNumber();
      sdk.client.pty.create({
        title: defaultTitle(nextNumber)
      }).then(pty => {
        const id = pty.data?.id;
        if (!id) return;
        const newTerminal = {
          id,
          title: pty.data?.title ?? defaultTitle(nextNumber),
          titleNumber: nextNumber
        };
        setStore("all", store.all.length, newTerminal);
        setStore("active", id);
      }).catch(error => {
        console.error("Failed to create terminal", error);
      });
    },
    update(pty) {
      update(sdk.client, pty);
    },
    trim(id) {
      const index = store.all.findIndex(x => x.id === id);
      if (index === -1) return;
      setStore("all", index, pty => trimTerminal(pty));
    },
    trimAll() {
      setStore("all", all => {
        const next = all.map(trimTerminal);
        if (next.every((pty, index) => pty === all[index])) return all;
        return next;
      });
    },
    async clone(id) {
      await clone(sdk.client, id);
    },
    bind() {
      const client = sdk.client;
      return {
        trim(id) {
          const index = store.all.findIndex(x => x.id === id);
          if (index === -1) return;
          setStore("all", index, pty => trimTerminal(pty));
        },
        update(pty) {
          update(client, pty);
        },
        async clone(id) {
          await clone(client, id);
        }
      };
    },
    open(id) {
      setStore("active", id);
    },
    next() {
      const index = store.all.findIndex(x => x.id === store.active);
      if (index === -1) return;
      const nextIndex = (index + 1) % store.all.length;
      setStore("active", store.all[nextIndex]?.id);
    },
    previous() {
      const index = store.all.findIndex(x => x.id === store.active);
      if (index === -1) return;
      const prevIndex = index === 0 ? store.all.length - 1 : index - 1;
      setStore("active", store.all[prevIndex]?.id);
    },
    async close(id) {
      const index = store.all.findIndex(f => f.id === id);
      if (index !== -1) {
        batch(() => {
          if (store.active === id) {
            const next = index > 0 ? store.all[index - 1]?.id : store.all[1]?.id;
            setStore("active", next);
          }
          setStore("all", produce(all => {
            all.splice(index, 1);
          }));
        });
      }
      await sdk.client.pty.remove({
        ptyID: id
      }).catch(error => {
        console.error("Failed to close terminal", error);
      });
    },
    move(id, to) {
      const index = store.all.findIndex(f => f.id === id);
      if (index === -1) return;
      setStore("all", produce(all => {
        all.splice(to, 0, all.splice(index, 1)[0]);
      }));
    }
  };
}
export const {
  use: useTerminal,
  provider: TerminalProvider
} = createSimpleContext({
  name: "Terminal",
  gate: false,
  init: () => {
    const sdk = useSDK();
    const params = useParams();
    const cache = new Map();
    caches.add(cache);
    onCleanup(() => caches.delete(cache));
    const disposeAll = () => {
      for (const entry of cache.values()) {
        entry.dispose();
      }
      cache.clear();
    };
    onCleanup(disposeAll);
    const prune = () => {
      while (cache.size > MAX_TERMINAL_SESSIONS) {
        const first = cache.keys().next().value;
        if (!first) return;
        const entry = cache.get(first);
        entry?.dispose();
        cache.delete(first);
      }
    };
    const loadWorkspace = (dir, legacySessionID) => {
      // Terminals are workspace-scoped so tabs persist while switching sessions in the same directory.
      const key = getWorkspaceTerminalCacheKey(dir);
      const existing = cache.get(key);
      if (existing) {
        cache.delete(key);
        cache.set(key, existing);
        return existing.value;
      }
      const entry = createRoot(dispose => ({
        value: createWorkspaceTerminalSession(sdk, dir, legacySessionID),
        dispose
      }));
      cache.set(key, entry);
      prune();
      return entry.value;
    };
    // Keep the last workspace while `params.dir` is momentarily undefined — this
    // memo is subscribed to the route params and re-runs during navigation to the
    // no-project home ("/") before this context's owner is disposed. Loading a
    // workspace with no directory threw deep in the persist layer, breaking the
    // whole flush so the home route never rendered.
    const workspace = createMemo(prev => params.dir ? loadWorkspace(params.dir, params.id) : prev);
    createEffect(on(() => ({
      dir: params.dir,
      id: params.id
    }), (next, prev) => {
      if (!prev?.dir) return;
      if (next.dir === prev.dir && next.id === prev.id) return;
      if (next.dir === prev.dir && next.id) return;
      loadWorkspace(prev.dir, prev.id).trimAll();
    }, {
      defer: true
    }));
    return {
      ready: () => workspace().ready(),
      all: () => workspace().all(),
      active: () => workspace().active(),
      new: () => workspace().new(),
      update: pty => workspace().update(pty),
      trim: id => workspace().trim(id),
      trimAll: () => workspace().trimAll(),
      clone: id => workspace().clone(id),
      bind: () => workspace(),
      open: id => workspace().open(id),
      close: id => workspace().close(id),
      move: (id, to) => workspace().move(id, to),
      next: () => workspace().next(),
      previous: () => workspace().previous()
    };
  }
});