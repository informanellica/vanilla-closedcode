import { batch, createMemo } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { Binary } from "core/util/binary";
import { retry } from "core/util/retry";
import { createSimpleContext } from "@/lib/context.js";
import { clearSessionPrefetch, getSessionPrefetch, getSessionPrefetchPromise, setSessionPrefetch } from "./global-sync/session-prefetch.js";
import { useGlobalSync } from "./global-sync.js";
import { useSDK } from "./sdk.js";
import { SESSION_CACHE_LIMIT, dropSessionCaches, pickSessionCacheEvictions } from "./global-sync/session-cache.js";
import { diffs as list, message as clean } from "@/utils/diffs.js";
const SKIP_PARTS = new Set(["patch", "step-start", "step-finish"]);
function sortParts(parts) {
  return parts.filter(part => !!part?.id).sort((a, b) => cmp(a.id, b.id));
}
function runInflight(map, key, task) {
  const pending = map.get(key);
  if (pending) return pending;
  const promise = task().finally(() => {
    map.delete(key);
  });
  map.set(key, promise);
  return promise;
}
const keyFor = (directory, id) => `${directory}\n${id}`;
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function merge(a, b) {
  const map = new Map(a.map(item => [item.id, item]));
  for (const item of b) map.set(item.id, item);
  return [...map.values()].sort((x, y) => cmp(x.id, y.id));
}
const hasParts = (parts, want) => {
  if (!parts) return want.length === 0;
  return want.every(part => Binary.search(parts, part.id, item => item.id).found);
};
const mergeParts = (parts, want) => {
  if (!parts) return sortParts(want);
  const next = [...parts];
  let changed = false;
  for (const part of want) {
    const result = Binary.search(next, part.id, item => item.id);
    if (result.found) continue;
    next.splice(result.index, 0, part);
    changed = true;
  }
  if (!changed) return parts;
  return next;
};
export function mergeOptimisticPage(page, items) {
  if (items.length === 0) return {
    ...page,
    confirmed: []
  };
  const session = [...page.session];
  const part = new Map(page.part.map(item => [item.id, sortParts(item.part)]));
  const confirmed = [];
  for (const item of items) {
    const result = Binary.search(session, item.message.id, message => message.id);
    const found = result.found;
    if (!found) session.splice(result.index, 0, item.message);
    const current = part.get(item.message.id);
    if (found && hasParts(current, item.parts)) {
      confirmed.push(item.message.id);
      continue;
    }
    part.set(item.message.id, mergeParts(current, item.parts));
  }
  return {
    cursor: page.cursor,
    complete: page.complete,
    session,
    part: [...part.entries()].sort((a, b) => cmp(a[0], b[0])).map(([id, part]) => ({
      id,
      part
    })),
    confirmed
  };
}
export function applyOptimisticAdd(draft, input) {
  const messages = draft.message[input.sessionID];
  if (messages) {
    const result = Binary.search(messages, input.message.id, m => m.id);
    messages.splice(result.index, 0, input.message);
  } else {
    draft.message[input.sessionID] = [input.message];
  }
  draft.part[input.message.id] = sortParts(input.parts);
}
export function applyOptimisticRemove(draft, input) {
  const messages = draft.message[input.sessionID];
  if (messages) {
    const result = Binary.search(messages, input.messageID, m => m.id);
    if (result.found) messages.splice(result.index, 1);
  }
  delete draft.part[input.messageID];
}
function setOptimisticAdd(setStore, input) {
  setStore("message", input.sessionID, messages => {
    if (!messages) return [input.message];
    const result = Binary.search(messages, input.message.id, m => m.id);
    const next = [...messages];
    next.splice(result.index, 0, input.message);
    return next;
  });
  setStore("part", input.message.id, sortParts(input.parts));
}
function setOptimisticRemove(setStore, input) {
  setStore("message", input.sessionID, messages => {
    if (!messages) return messages;
    const result = Binary.search(messages, input.messageID, m => m.id);
    if (!result.found) return messages;
    const next = [...messages];
    next.splice(result.index, 1);
    return next;
  });
  setStore("part", part => {
    if (!(input.messageID in part)) return part;
    const next = {
      ...part
    };
    delete next[input.messageID];
    return next;
  });
}
export const {
  use: useSync,
  provider: SyncProvider
} = createSimpleContext({
  name: "Sync",
  init: () => {
    const globalSync = useGlobalSync();
    const sdk = useSDK();
    const current = createMemo(() => globalSync.child(sdk.directory));
    const target = directory => {
      if (!directory || directory === sdk.directory) return current();
      return globalSync.child(directory);
    };
    const absolute = path => (current()[0].path.directory + "/" + path).replace("//", "/");
    const initialMessagePageSize = 80;
    const historyMessagePageSize = 200;
    const inflight = new Map();
    const inflightDiff = new Map();
    const inflightTodo = new Map();
    const optimistic = new Map();
    const maxDirs = 30;
    const seen = new Map();
    const [meta, setMeta] = createStore({
      limit: {},
      cursor: {},
      complete: {},
      loading: {}
    });
    const getSession = sessionID => {
      const store = current()[0];
      const match = Binary.search(store.session, sessionID, s => s.id);
      if (match.found) return store.session[match.index];
      return undefined;
    };
    const setOptimistic = (directory, sessionID, item) => {
      const key = keyFor(directory, sessionID);
      const list = optimistic.get(key);
      if (list) {
        list.set(item.message.id, {
          message: item.message,
          parts: sortParts(item.parts)
        });
        return;
      }
      optimistic.set(key, new Map([[item.message.id, {
        message: item.message,
        parts: sortParts(item.parts)
      }]]));
    };
    const clearOptimistic = (directory, sessionID, messageID) => {
      const key = keyFor(directory, sessionID);
      if (!messageID) {
        optimistic.delete(key);
        return;
      }
      const list = optimistic.get(key);
      if (!list) return;
      list.delete(messageID);
      if (list.size === 0) optimistic.delete(key);
    };
    const getOptimistic = (directory, sessionID) => [...(optimistic.get(keyFor(directory, sessionID))?.values() ?? [])];
    const seenFor = directory => {
      const existing = seen.get(directory);
      if (existing) {
        seen.delete(directory);
        seen.set(directory, existing);
        return existing;
      }
      const created = new Set();
      seen.set(directory, created);
      while (seen.size > maxDirs) {
        const first = seen.keys().next().value;
        if (!first) break;
        const stale = [...(seen.get(first) ?? [])];
        seen.delete(first);
        const [, setStore] = globalSync.child(first, {
          bootstrap: false
        });
        evict(first, setStore, stale);
      }
      return created;
    };
    const clearMeta = (directory, sessionIDs) => {
      if (sessionIDs.length === 0) return;
      for (const sessionID of sessionIDs) {
        clearOptimistic(directory, sessionID);
      }
      setMeta(produce(draft => {
        for (const sessionID of sessionIDs) {
          const key = keyFor(directory, sessionID);
          delete draft.limit[key];
          delete draft.cursor[key];
          delete draft.complete[key];
          delete draft.loading[key];
        }
      }));
    };
    const evict = (directory, setStore, sessionIDs) => {
      if (sessionIDs.length === 0) return;
      clearSessionPrefetch(directory, sessionIDs);
      for (const sessionID of sessionIDs) {
        globalSync.todo.set(sessionID, undefined);
      }
      setStore(produce(draft => {
        dropSessionCaches(draft, sessionIDs);
      }));
      clearMeta(directory, sessionIDs);
    };
    const touch = (directory, setStore, sessionID) => {
      const stale = pickSessionCacheEvictions({
        seen: seenFor(directory),
        keep: sessionID,
        limit: SESSION_CACHE_LIMIT
      });
      evict(directory, setStore, stale);
    };
    const fetchMessages = async input => {
      const messages = await retry(() => input.client.session.messages({
        sessionID: input.sessionID,
        limit: input.limit,
        before: input.before
      }));
      const items = (messages.data ?? []).filter(x => !!x?.info?.id);
      const session = items.map(x => clean(x.info)).sort((a, b) => cmp(a.id, b.id));
      const part = items.map(message => ({
        id: message.info.id,
        part: sortParts(message.parts)
      }));
      const cursor = messages.response.headers.get("x-next-cursor") ?? undefined;
      return {
        session,
        part,
        cursor,
        complete: !cursor
      };
    };
    const tracked = (directory, sessionID) => seen.get(directory)?.has(sessionID) ?? false;
    const loadMessages = async input => {
      const key = keyFor(input.directory, input.sessionID);
      if (meta.loading[key]) return;
      setMeta("loading", key, true);
      await fetchMessages(input).then(page => {
        if (!tracked(input.directory, input.sessionID)) return;
        const next = mergeOptimisticPage(page, getOptimistic(input.directory, input.sessionID));
        for (const messageID of next.confirmed) {
          clearOptimistic(input.directory, input.sessionID, messageID);
        }
        const [store] = globalSync.child(input.directory, {
          bootstrap: false
        });
        const cached = input.mode === "prepend" ? store.message[input.sessionID] ?? [] : [];
        const message = input.mode === "prepend" ? merge(cached, next.session) : next.session;
        batch(() => {
          input.setStore("message", input.sessionID, reconcile(message, {
            key: "id"
          }));
          for (const p of next.part) {
            const filtered = p.part.filter(x => !SKIP_PARTS.has(x.type));
            if (filtered.length) input.setStore("part", p.id, filtered);
          }
          setMeta("limit", key, message.length);
          setMeta("cursor", key, next.cursor);
          setMeta("complete", key, next.complete);
          setSessionPrefetch({
            directory: input.directory,
            sessionID: input.sessionID,
            limit: message.length,
            cursor: next.cursor,
            complete: next.complete
          });
        });
      }).finally(() => {
        setMeta(produce(draft => {
          if (!tracked(input.directory, input.sessionID)) {
            delete draft.loading[key];
            return;
          }
          draft.loading[key] = false;
        }));
      });
    };
    return {
      get data() {
        return current()[0];
      },
      get set() {
        return current()[1];
      },
      get status() {
        return current()[0].status;
      },
      get ready() {
        return current()[0].status !== "loading";
      },
      get project() {
        const store = current()[0];
        const match = Binary.search(globalSync.data.project, store.project, p => p.id);
        if (match.found) return globalSync.data.project[match.index];
        return undefined;
      },
      session: {
        get: getSession,
        optimistic: {
          add(input) {
            const directory = input.directory ?? sdk.directory;
            const [, setStore] = target(input.directory);
            setOptimistic(directory, input.sessionID, {
              message: input.message,
              parts: input.parts
            });
            setOptimisticAdd(setStore, input);
          },
          remove(input) {
            const directory = input.directory ?? sdk.directory;
            const [, setStore] = target(input.directory);
            clearOptimistic(directory, input.sessionID, input.messageID);
            setOptimisticRemove(setStore, input);
          }
        },
        addOptimisticMessage(input) {
          const message = {
            id: input.messageID,
            sessionID: input.sessionID,
            role: "user",
            time: {
              created: Date.now()
            },
            agent: input.agent,
            model: {
              ...input.model,
              variant: input.variant
            }
          };
          const [, setStore] = target();
          setOptimistic(sdk.directory, input.sessionID, {
            message,
            parts: input.parts
          });
          setOptimisticAdd(setStore, {
            sessionID: input.sessionID,
            message,
            parts: input.parts
          });
        },
        async sync(sessionID, opts) {
          const directory = sdk.directory;
          const client = sdk.client;
          const [store, setStore] = globalSync.child(directory);
          const key = keyFor(directory, sessionID);
          touch(directory, setStore, sessionID);
          const seeded = getSessionPrefetch(directory, sessionID);
          if (seeded && store.message[sessionID] !== undefined && meta.limit[key] === undefined) {
            batch(() => {
              setMeta("limit", key, seeded.limit);
              setMeta("cursor", key, seeded.cursor);
              setMeta("complete", key, seeded.complete);
              setMeta("loading", key, false);
            });
          }
          return runInflight(inflight, key, async () => {
            const pending = getSessionPrefetchPromise(directory, sessionID);
            if (pending) {
              await pending;
              const seeded = getSessionPrefetch(directory, sessionID);
              if (seeded && store.message[sessionID] !== undefined && meta.limit[key] === undefined) {
                batch(() => {
                  setMeta("limit", key, seeded.limit);
                  setMeta("cursor", key, seeded.cursor);
                  setMeta("complete", key, seeded.complete);
                  setMeta("loading", key, false);
                });
              }
            }
            const hasSession = Binary.search(store.session, sessionID, s => s.id).found;
            const cached = store.message[sessionID] !== undefined && meta.limit[key] !== undefined;
            if (cached && hasSession && !opts?.force) return;
            const limit = meta.limit[key] ?? initialMessagePageSize;
            const sessionReq = hasSession && !opts?.force ? Promise.resolve() : retry(() => client.session.get({
              sessionID
            })).then(session => {
              if (!tracked(directory, sessionID)) return;
              const data = session.data;
              if (!data) return;
              setStore("session", produce(draft => {
                const match = Binary.search(draft, sessionID, s => s.id);
                if (match.found) {
                  draft[match.index] = data;
                  return;
                }
                draft.splice(match.index, 0, data);
              }));
            });
            const messagesReq = cached && !opts?.force ? Promise.resolve() : loadMessages({
              directory,
              client,
              setStore,
              sessionID,
              limit
            });
            await Promise.all([sessionReq, messagesReq]);
          });
        },
        async diff(sessionID, opts) {
          const directory = sdk.directory;
          const client = sdk.client;
          const [store, setStore] = globalSync.child(directory);
          touch(directory, setStore, sessionID);
          if (store.session_diff[sessionID] !== undefined && !opts?.force) return;
          const key = keyFor(directory, sessionID);
          return runInflight(inflightDiff, key, () => retry(() => client.session.diff({
            sessionID
          })).then(diff => {
            if (!tracked(directory, sessionID)) return;
            setStore("session_diff", sessionID, reconcile(list(diff.data), {
              key: "file"
            }));
          }));
        },
        async todo(sessionID, opts) {
          const directory = sdk.directory;
          const client = sdk.client;
          const [store, setStore] = globalSync.child(directory);
          touch(directory, setStore, sessionID);
          const existing = store.todo[sessionID];
          const cached = globalSync.data.session_todo[sessionID];
          if (existing !== undefined) {
            if (cached === undefined) {
              globalSync.todo.set(sessionID, existing);
            }
            if (!opts?.force) return;
          }
          if (cached !== undefined) {
            setStore("todo", sessionID, reconcile(cached, {
              key: "id"
            }));
          }
          const key = keyFor(directory, sessionID);
          return runInflight(inflightTodo, key, () => retry(() => client.session.todo({
            sessionID
          })).then(todo => {
            if (!tracked(directory, sessionID)) return;
            const list = todo.data ?? [];
            setStore("todo", sessionID, reconcile(list, {
              key: "id"
            }));
            globalSync.todo.set(sessionID, list);
          }));
        },
        history: {
          more(sessionID) {
            const store = current()[0];
            const key = keyFor(sdk.directory, sessionID);
            if (store.message[sessionID] === undefined) return false;
            if (meta.limit[key] === undefined) return false;
            if (meta.complete[key]) return false;
            return !!meta.cursor[key];
          },
          loading(sessionID) {
            const key = keyFor(sdk.directory, sessionID);
            return meta.loading[key] ?? false;
          },
          async loadMore(sessionID, count) {
            const directory = sdk.directory;
            const client = sdk.client;
            const [, setStore] = globalSync.child(directory);
            touch(directory, setStore, sessionID);
            const key = keyFor(directory, sessionID);
            const step = count ?? historyMessagePageSize;
            if (meta.loading[key]) return;
            if (meta.complete[key]) return;
            const before = meta.cursor[key];
            if (!before) return;
            await loadMessages({
              directory,
              client,
              setStore,
              sessionID,
              limit: step,
              before,
              mode: "prepend"
            });
          }
        },
        evict(sessionID, directory = sdk.directory) {
          const [, setStore] = globalSync.child(directory);
          seenFor(directory).delete(sessionID);
          evict(directory, setStore, [sessionID]);
        },
        fetch: async (count = 10) => {
          const directory = sdk.directory;
          const client = sdk.client;
          const [store, setStore] = globalSync.child(directory);
          setStore("limit", x => x + count);
          await client.session.list().then(x => {
            const sessions = (x.data ?? []).filter(s => !!s?.id).sort((a, b) => cmp(a.id, b.id)).slice(0, store.limit);
            setStore("session", reconcile(sessions, {
              key: "id"
            }));
          });
        },
        more: createMemo(() => current()[0].session.length >= current()[0].limit),
        archive: async sessionID => {
          const directory = sdk.directory;
          const client = sdk.client;
          const [, setStore] = globalSync.child(directory);
          await client.session.update({
            sessionID,
            time: {
              archived: Date.now()
            }
          });
          setStore(produce(draft => {
            const match = Binary.search(draft.session, sessionID, s => s.id);
            if (match.found) draft.session.splice(match.index, 1);
          }));
        }
      },
      absolute,
      get directory() {
        return current()[0].path.directory;
      }
    };
  }
});