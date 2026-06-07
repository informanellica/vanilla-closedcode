import { createEffect, createMemo, on, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { useParams } from "@solidjs/router";
import { useGlobalSync } from "@/context/global-sync.js";
import { useSync } from "@/context/sync.js";
import { useComposerController } from "@/controllers/session-composer.js";
import { sessionPermissionRequest, sessionQuestionRequest } from "./session-request-tree.js";
export const todoState = input => {
  if (input.count === 0) return "hide";
  if (!input.live) return "clear";
  if (!input.done) return "open";
  return "close";
};
const idle = {
  type: "idle"
};
export function createSessionComposerState(options) {
  const params = useParams();
  const sync = useSync();
  const globalSync = useGlobalSync();
  const composer = useComposerController();
  const questionRequest = createMemo(() => {
    return sessionQuestionRequest(sync.data?.session, sync.data?.question, params.id);
  });
  const permissionRequest = createMemo(() => {
    return sessionPermissionRequest(sync.data?.session, sync.data?.permission, params.id, item => {
      return composer.requiresPermission(item);
    });
  });
  const blocked = createMemo(() => {
    const id = params.id;
    if (!id) return false;
    return !!permissionRequest() || !!questionRequest();
  });
  const todos = createMemo(() => {
    const id = params.id;
    if (!id) return [];
    return globalSync.data.session_todo[id] ?? [];
  });
  const done = createMemo(() => todos().length > 0 && todos().every(todo => todo.status === "completed" || todo.status === "cancelled"));
  const status = createMemo(() => {
    const id = params.id;
    if (!id) return idle;
    return sync.data?.session_status?.[id] ?? idle;
  });
  const busy = createMemo(() => status().type !== "idle");
  const live = createMemo(() => busy() || blocked());
  const [store, setStore] = createStore({
    responding: undefined,
    dock: todos().length > 0 && live(),
    closing: false,
    opening: false
  });
  const permissionResponding = createMemo(() => {
    const perm = permissionRequest();
    if (!perm) return false;
    return store.responding === perm.id;
  });
  const decide = response => {
    const perm = permissionRequest();
    if (!perm) return;
    composer.respondPermission({
      permission: perm,
      response,
      isResponding: () => store.responding === perm.id,
      mark: id => setStore("responding", id),
      clear: id => setStore("responding", current => current === id ? undefined : current)
    });
  };
  let timer;
  let raf;
  const closeMs = () => {
    const value = options?.closeMs;
    if (typeof value === "function") return Math.max(0, value());
    if (typeof value === "number") return Math.max(0, value);
    return 400;
  };
  const scheduleClose = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      setStore({
        dock: false,
        closing: false
      });
      timer = undefined;
    }, closeMs());
  };

  // Keep stale turn todos from reopening if the model never clears them.
  const clear = () => {
    const id = params.id;
    if (!id) return;
    globalSync.todo.set(id, []);
    sync.set("todo", id, []);
  };
  createEffect(on(() => [todos().length, done(), live()], ([count, complete, active]) => {
    if (raf) cancelAnimationFrame(raf);
    raf = undefined;
    const next = todoState({
      count,
      done: complete,
      live: active
    });
    if (next === "hide") {
      if (timer) window.clearTimeout(timer);
      timer = undefined;
      setStore({
        dock: false,
        closing: false,
        opening: false
      });
      return;
    }
    if (next === "clear") {
      if (timer) window.clearTimeout(timer);
      timer = undefined;
      clear();
      return;
    }
    if (next === "open") {
      if (timer) window.clearTimeout(timer);
      timer = undefined;
      const hidden = !store.dock || store.closing;
      setStore({
        dock: true,
        closing: false
      });
      if (hidden) {
        setStore("opening", true);
        raf = requestAnimationFrame(() => {
          setStore("opening", false);
          raf = undefined;
        });
        return;
      }
      setStore("opening", false);
      return;
    }
    setStore({
      dock: true,
      opening: false,
      closing: true
    });
    if (!timer) scheduleClose();
  }));
  onCleanup(() => {
    if (!timer) return;
    window.clearTimeout(timer);
  });
  onCleanup(() => {
    if (!raf) return;
    cancelAnimationFrame(raf);
  });
  return {
    blocked,
    questionRequest,
    permissionRequest,
    permissionResponding,
    decide,
    todos,
    dock: () => store.dock,
    closing: () => store.closing,
    opening: () => store.opening
  };
}