/** @file Prompt context: manages the editable prompt (an array of typed parts) and attached context items per directory/session, with persistence and an LRU cache of prompt sessions. */
import { createSimpleContext } from "@/lib/context.js";
import { checksum } from "core/util/encode";
import { useParams } from "../lib/router/index.js";
import { batch, createMemo, createRoot, getOwner, onCleanup } from "../lib/reactivity.js";
import { createStore } from "../lib/store.js";
import { Persist, persisted } from "@/utils/persist.js";
/** The empty default prompt: a single empty text part. */
export const DEFAULT_PROMPT = [{
  type: "text",
  content: "",
  start: 0,
  end: 0
}];
/**
 * Structural equality for two file selections (line/char ranges).
 * @param {Object} a - First selection ({startLine, startChar, endLine, endChar}) or falsy.
 * @param {Object} b - Second selection or falsy.
 * @returns {boolean} True when both are absent or all bounds match.
 */
function isSelectionEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.startLine === b.startLine && a.startChar === b.startChar && a.endLine === b.endLine && a.endChar === b.endChar;
}
/**
 * Structural equality for two prompt parts of the same type (text, file, agent, or image).
 * @param {Object} partA - First prompt part.
 * @param {Object} partB - Second prompt part.
 * @returns {boolean} True when the parts are of matching type and equal content.
 */
function isPartEqual(partA, partB) {
  switch (partA.type) {
    case "text":
      return partB.type === "text" && partA.content === partB.content;
    case "file":
      return partB.type === "file" && partA.path === partB.path && isSelectionEqual(partA.selection, partB.selection);
    case "agent":
      return partB.type === "agent" && partA.name === partB.name;
    case "image":
      return partB.type === "image" && partA.id === partB.id;
  }
}
/**
 * Structural equality for two prompts (arrays of parts), part by part.
 * @param {Array} promptA - First prompt.
 * @param {Array} promptB - Second prompt.
 * @returns {boolean} True when both prompts have the same parts in the same order.
 */
export function isPromptEqual(promptA, promptB) {
  if (promptA.length !== promptB.length) return false;
  for (let i = 0; i < promptA.length; i++) {
    if (!isPartEqual(promptA[i], promptB[i])) return false;
  }
  return true;
}
/**
 * Shallow-clones a file selection.
 * @param {Object} selection - The selection to clone (may be falsy).
 * @returns {Object} A clone, or undefined when input is falsy.
 */
function cloneSelection(selection) {
  if (!selection) return undefined;
  return {
    ...selection
  };
}
/**
 * Clones a prompt part, deep-cloning the nested selection for file parts.
 * @param {Object} part - The prompt part to clone.
 * @returns {Object} A cloned part.
 */
function clonePart(part) {
  if (part.type === "text") return {
    ...part
  };
  if (part.type === "image") return {
    ...part
  };
  if (part.type === "agent") return {
    ...part
  };
  return {
    ...part,
    selection: cloneSelection(part.selection)
  };
}
/**
 * Clones an entire prompt (array of parts).
 * @param {Array} prompt - The prompt to clone.
 * @returns {Array} A new array of cloned parts.
 */
function clonePrompt(prompt) {
  return prompt.map(clonePart);
}
/**
 * Builds a stable de-duplication key for a context item. File items key on path, selection range,
 * and comment id (or a short checksum of the comment text); other types key on their type alone.
 * @param {Object} item - The context item.
 * @returns {string} The de-duplication key.
 */
function contextItemKey(item) {
  if (item.type !== "file") return item.type;
  const start = item.selection?.startLine;
  const end = item.selection?.endLine;
  const key = `${item.type}:${item.path}:${start}:${end}`;
  if (item.commentID) {
    return `${key}:c=${item.commentID}`;
  }
  const comment = item.comment?.trim();
  if (!comment) return key;
  const digest = checksum(comment) ?? comment;
  return `${key}:c=${digest.slice(0, 8)}`;
}
/**
 * Whether a context item is a file item carrying a non-empty comment.
 * @param {Object} item - The context item.
 * @returns {boolean} True for file items with comment text.
 */
function isCommentItem(item) {
  return item.type === "file" && !!item.comment?.trim();
}
/**
 * Builds the prompt mutation actions (set/reset) bound to a store setter.
 * @param {Function} setStore - The store setter for a prompt session.
 * @returns {Object} An object with `set(prompt, cursorPosition)` and `reset()`.
 */
function createPromptActions(setStore) {
  return {
    set(prompt, cursorPosition) {
      const next = clonePrompt(prompt);
      batch(() => {
        setStore("prompt", next);
        if (cursorPosition !== undefined) setStore("cursor", cursorPosition);
      });
    },
    reset() {
      batch(() => {
        setStore("prompt", clonePrompt(DEFAULT_PROMPT));
        setStore("cursor", 0);
      });
    }
  };
}
const WORKSPACE_KEY = "__workspace__";
const MAX_PROMPT_SESSIONS = 20;
/**
 * Creates a persisted prompt state for one directory/session, with the prompt parts, cursor, and
 * attached context items, plus accessors and mutators.
 * @param {string} dir - The directory the prompt belongs to.
 * @param {string} id - The session id (omit for the workspace-level prompt).
 * @returns {Object} A prompt session: `ready`, `current`, `cursor`, `dirty`, `context` (items add/remove/comment ops), `set`, and `reset`.
 */
function createPromptSession(dir, id) {
  const legacy = `${dir}/prompt${id ? "/" + id : ""}.v2`;
  const [store, setStore, _, ready] = persisted(Persist.scoped(dir, id, "prompt", [legacy]), createStore({
    prompt: clonePrompt(DEFAULT_PROMPT),
    cursor: undefined,
    context: {
      items: []
    }
  }));
  const actions = createPromptActions(setStore);
  return {
    ready,
    current: () => store.prompt,
    cursor: createMemo(() => store.cursor),
    dirty: () => !isPromptEqual(store.prompt, DEFAULT_PROMPT),
    context: {
      items: createMemo(() => store.context.items),
      add(item) {
        const key = contextItemKey(item);
        if (store.context.items.find(x => x.key === key)) return;
        setStore("context", "items", items => [...items, {
          key,
          ...item
        }]);
      },
      remove(key) {
        setStore("context", "items", items => items.filter(x => x.key !== key));
      },
      removeComment(path, commentID) {
        setStore("context", "items", items => items.filter(item => !(item.type === "file" && item.path === path && item.commentID === commentID)));
      },
      updateComment(path, commentID, next) {
        setStore("context", "items", items => items.map(item => {
          if (item.type !== "file" || item.path !== path || item.commentID !== commentID) return item;
          const value = {
            ...item,
            ...next
          };
          return {
            ...value,
            key: contextItemKey(value)
          };
        }));
      },
      replaceComments(items) {
        setStore("context", "items", current => [...current.filter(item => !isCommentItem(item)), ...items.map(item => ({
          ...item,
          key: contextItemKey(item)
        }))]);
      }
    },
    set: actions.set,
    reset: actions.reset
  };
}
/**
 * Prompt context. Lazily loads (and LRU-caches up to MAX_PROMPT_SESSIONS) a persisted prompt
 * session per directory/session, tracking the active session from the router params.
 * Exposes: `ready`, `current` (prompt parts), `cursor`, `dirty`, `context` (attached items with
 * add/remove/comment operations), `set(prompt, cursorPosition, scope)`, and `reset(scope)`; an
 * optional `scope` ({dir, id}) targets a session other than the active one.
 */
export const {
  use: usePrompt,
  provider: PromptProvider
} = createSimpleContext({
  name: "Prompt",
  gate: false,
  init: () => {
    const params = useParams();
    const cache = new Map();
    // Dispose every cached prompt session and clear the cache.
    const disposeAll = () => {
      for (const entry of cache.values()) {
        entry.dispose();
      }
      cache.clear();
    };
    onCleanup(disposeAll);
    // Evict least-recently-used prompt sessions until the cache is within MAX_PROMPT_SESSIONS.
    const prune = () => {
      while (cache.size > MAX_PROMPT_SESSIONS) {
        const first = cache.keys().next().value;
        if (!first) return;
        const entry = cache.get(first);
        entry?.dispose();
        cache.delete(first);
      }
    };
    const owner = getOwner();
    // Get (or lazily create and cache) the prompt session for a directory/session, marking it
    // most-recently-used; created sessions are owned by the context root so they dispose with it.
    const load = (dir, id) => {
      const key = `${dir}:${id ?? WORKSPACE_KEY}`;
      const existing = cache.get(key);
      if (existing) {
        cache.delete(key);
        cache.set(key, existing);
        return existing.value;
      }
      const entry = createRoot(dispose => ({
        value: createPromptSession(dir, id),
        dispose
      }), owner);
      cache.set(key, entry);
      prune();
      return entry.value;
    };
    // The prompt session for the active route (directory/session from router params).
    const session = createMemo(() => load(params.dir, params.id));
    // The prompt session to act on: the explicit scope when given, otherwise the active session.
    const pick = scope => scope ? load(scope.dir, scope.id) : session();
    return {
      ready: () => session().ready,
      current: () => session().current(),
      cursor: () => session().cursor(),
      dirty: () => session().dirty(),
      context: {
        items: () => session().context.items(),
        add: item => session().context.add(item),
        remove: key => session().context.remove(key),
        removeComment: (path, commentID) => session().context.removeComment(path, commentID),
        updateComment: (path, commentID, next) => session().context.updateComment(path, commentID, next),
        replaceComments: items => session().context.replaceComments(items)
      },
      set: (prompt, cursorPosition, scope) => pick(scope).set(prompt, cursorPosition),
      reset: scope => pick(scope).reset()
    };
  }
});