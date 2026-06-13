import { batch, createMemo, createRoot, onCleanup } from "../lib/reactivity.js";
import { createStore, reconcile } from "../lib/store.js";
import { createSimpleContext } from "@/lib/context.js";
import { useParams } from "../lib/router/index.js";
import { Persist, persisted } from "@/utils/persist.js";
import { createScopedCache } from "@/utils/scoped-cache.js";
import { uuid } from "@/utils/uuid.js";
const WORKSPACE_KEY = "__workspace__";
const MAX_COMMENT_SESSIONS = 20;
function sessionKey(dir, id) {
  return `${dir}\n${id ?? WORKSPACE_KEY}`;
}
function decodeSessionKey(key) {
  const split = key.lastIndexOf("\n");
  if (split < 0) return {
    dir: key,
    id: WORKSPACE_KEY
  };
  return {
    dir: key.slice(0, split),
    id: key.slice(split + 1)
  };
}
function aggregate(comments) {
  return Object.keys(comments).flatMap(file => comments[file] ?? []).slice().sort((a, b) => a.time - b.time);
}
function cloneSelection(selection) {
  const next = {
    start: selection.start,
    end: selection.end
  };
  if (selection.side) next.side = selection.side;
  if (selection.endSide) next.endSide = selection.endSide;
  return next;
}
function cloneComment(comment) {
  return {
    ...comment,
    selection: cloneSelection(comment.selection)
  };
}
function group(comments) {
  return comments.reduce((acc, comment) => {
    const list = acc[comment.file];
    const next = cloneComment(comment);
    if (list) {
      list.push(next);
      return acc;
    }
    acc[comment.file] = [next];
    return acc;
  }, {});
}
function createCommentSessionState(store, setStore) {
  const [state, setState] = createStore({
    focus: null,
    active: null
  });
  const all = () => aggregate(store.comments);
  const setRef = (key, value) => setState(key, value);
  const setFocus = value => setRef("focus", value);
  const setActive = value => setRef("active", value);
  const list = file => store.comments[file] ?? [];
  const add = input => {
    const next = {
      id: uuid(),
      time: Date.now(),
      ...input,
      selection: cloneSelection(input.selection)
    };
    batch(() => {
      setStore("comments", input.file, items => [...(items ?? []), next]);
      setFocus({
        file: input.file,
        id: next.id
      });
    });
    return next;
  };
  const remove = (file, id) => {
    batch(() => {
      setStore("comments", file, items => (items ?? []).filter(item => item.id !== id));
      setFocus(current => current?.file === file && current.id === id ? null : current);
    });
  };
  const update = (file, id, comment) => {
    setStore("comments", file, items => (items ?? []).map(item => {
      if (item.id !== id) return item;
      return {
        ...item,
        comment
      };
    }));
  };
  const replace = comments => {
    batch(() => {
      setStore("comments", reconcile(group(comments)));
      setFocus(null);
      setActive(null);
    });
  };
  const clear = () => {
    batch(() => {
      setStore("comments", reconcile({}));
      setFocus(null);
      setActive(null);
    });
  };
  return {
    list,
    all,
    add,
    remove,
    update,
    replace,
    clear,
    focus: () => state.focus,
    setFocus,
    clearFocus: () => setRef("focus", null),
    active: () => state.active,
    setActive,
    clearActive: () => setRef("active", null)
  };
}
export function createCommentSessionForTest(comments = {}) {
  const [store, setStore] = createStore({
    comments
  });
  return createCommentSessionState(store, setStore);
}
function createCommentSession(dir, id) {
  const legacy = `${dir}/comments${id ? "/" + id : ""}.v1`;
  const [store, setStore, _, ready] = persisted(Persist.scoped(dir, id, "comments", [legacy]), createStore({
    comments: {}
  }));
  const session = createCommentSessionState(store, setStore);
  return {
    ready,
    list: session.list,
    all: session.all,
    add: session.add,
    remove: session.remove,
    update: session.update,
    replace: session.replace,
    clear: session.clear,
    focus: session.focus,
    setFocus: session.setFocus,
    clearFocus: session.clearFocus,
    active: session.active,
    setActive: session.setActive,
    clearActive: session.clearActive
  };
}
export const {
  use: useComments,
  provider: CommentsProvider
} = createSimpleContext({
  name: "Comments",
  gate: false,
  init: () => {
    const params = useParams();
    const cache = createScopedCache(key => {
      const decoded = decodeSessionKey(key);
      return createRoot(dispose => ({
        value: createCommentSession(decoded.dir, decoded.id === WORKSPACE_KEY ? undefined : decoded.id),
        dispose
      }));
    }, {
      maxEntries: MAX_COMMENT_SESSIONS,
      dispose: entry => entry.dispose()
    });
    onCleanup(() => cache.clear());
    const load = (dir, id) => {
      const key = sessionKey(dir, id);
      return cache.get(key).value;
    };
    const session = createMemo(() => load(params.dir, params.id));
    return {
      ready: () => session().ready(),
      list: file => session().list(file),
      all: () => session().all(),
      add: input => session().add(input),
      remove: (file, id) => session().remove(file, id),
      update: (file, id, comment) => session().update(file, id, comment),
      replace: comments => session().replace(comments),
      clear: () => session().clear(),
      focus: () => session().focus(),
      setFocus: focus => session().setFocus(focus),
      clearFocus: () => session().clearFocus(),
      active: () => session().active(),
      setActive: active => session().setActive(active),
      clearActive: () => session().clearActive()
    };
  }
});