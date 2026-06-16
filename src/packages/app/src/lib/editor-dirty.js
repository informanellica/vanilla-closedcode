/** @file Bridges the vanilla CodeMirror editor island's dirty state into a reactive store so file tabs can show an unsaved indicator. */
// editor-dirty.js — bridges the vanilla CodeMirror editor island's dirty state
// (packages/app/public/vanilla-ide.js) into a Solid-reactive store so the center
// file tab (session-sortable-tab.js) can show an unsaved indicator.
//
// The island dispatches a window CustomEvent on every dirty-state change:
//   window.dispatchEvent(new CustomEvent("vide:dirty", {
//     detail: { path: <project-relative path>, dirty: <boolean> }
//   }))
//
// The `path` in the event detail is `inst.relName`, which file-tabs.js sets to
// `file.pathFromTab(tab)` — the exact same normalized, project-relative string
// the tab derives via `path()`. So the key matches the tab identity directly and
// needs no `file://` decoding here.
import { createStore } from "./store.js";

// Module-level store: { [relPath]: true } for files with unsaved edits.
const [dirty, setDirty] = createStore({});

if (typeof window !== "undefined") {
  window.addEventListener("vide:dirty", event => {
    const detail = event && event.detail;
    if (!detail || typeof detail.path !== "string") return;
    if (detail.dirty) {
      setDirty(detail.path, true);
    } else {
      // Remove the key so the store doesn't accumulate stale entries.
      setDirty(detail.path, undefined);
    }
  });
}

/**
 * Reactive accessor for the editor dirty-state store.
 * @returns {Object} An object with `isDirty(path)` returning whether the given
 *   project-relative path has unsaved edits.
 */
export function useEditorDirty() {
  return {
    isDirty: path => (typeof path === "string" ? !!dirty[path] : false)
  };
}
