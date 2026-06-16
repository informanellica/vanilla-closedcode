/** @file Inline-editor controller for the sidebar: manages a single active inline editor (open/close/save, keyboard handling) and provides an InlineEditor component that swaps between a display span and an editable input. */
import { createComponent, createMemo, createRenderEffect, onCleanup } from "../../lib/reactivity.js";
import { createStore } from "../../lib/store.js";
import { InlineInput } from "@/vendor/ui/components/inline-input.js";
/**
 * Create a controller that coordinates a single active inline text editor.
 * Returns the editor store plus open/close/save helpers, a keydown handler, and
 * an `InlineEditor` component that renders an editable input while active and a
 * static display span otherwise.
 * @returns {Object} The inline-editor controller API (editor, editorOpen, editorValue, openEditor, closeEditor, saveEditor, editorKeyDown, setEditor, InlineEditor).
 */
export function createInlineEditorController() {
  // This controller intentionally supports one active inline editor at a time.
  const [editor, setEditor] = createStore({
    active: "",
    value: ""
  });
  /**
   * Check whether the editor with the given id is currently open.
   * @param {string} id - The editor id.
   * @returns {boolean} True when that editor is active.
   */
  const editorOpen = id => editor.active === id;
  /**
   * Get the current draft value of the active editor.
   * @returns {string} The draft value.
   */
  const editorValue = () => editor.value;
  /**
   * Open the editor for a given id, seeding its draft value.
   * @param {string} id - The editor id to activate.
   * @param {string} value - The initial draft value.
   * @returns {void}
   */
  const openEditor = (id, value) => {
    if (!id) return;
    setEditor({
      active: id,
      value
    });
  };
  /**
   * Close the active editor and clear its draft value.
   * @returns {void}
   */
  const closeEditor = () => setEditor({
    active: "",
    value: ""
  });
  /**
   * Commit the trimmed draft value: close the editor and, if non-empty, invoke the callback with it.
   * @param {Function} callback - Receives the trimmed value when it is non-empty.
   * @returns {void}
   */
  const saveEditor = callback => {
    const next = editor.value.trim();
    if (!next) {
      closeEditor();
      return;
    }
    closeEditor();
    callback(next);
  };
  /**
   * Keyboard handler for the editor input: Enter commits (via saveEditor), Escape cancels.
   * @param {KeyboardEvent} event - The keydown event.
   * @param {Function} callback - Save callback forwarded to saveEditor on Enter.
   * @returns {void}
   */
  const editorKeyDown = (event, callback) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveEditor(callback);
      return;
    }
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeEditor();
  };
  /**
   * Component that renders an inline value: a static display span by default,
   * swapping to an editable input while editing (auto-focused on mount).
   * @param {Object} props - Component props.
   * @param {string} props.id - Editor id used to track the active editor.
   * @param {Function} props.value - Accessor returning the current display value.
   * @param {Function} props.onSave - Called with the new value when an edit is committed.
   * @param {boolean} props.editing - Optional override forcing edit mode regardless of active id.
   * @param {boolean} props.stopPropagation - Optional flag to stop propagation of pointer/click events on the display span.
   * @param {boolean} props.openOnDblClick - Optional flag (default true) enabling double-click to open the editor.
   * @param {string} props.class - Class applied to the input and (by default) the display span.
   * @param {string} props.displayClass - Optional class applied to the display span instead of `class`.
   * @returns {*} A reactive accessor yielding the input or display element.
   */
  const InlineEditor = props => {
    let frame;
    onCleanup(() => {
      if (frame === undefined) return;
      cancelAnimationFrame(frame);
    });
    const isEditing = () => props.editing ?? editorOpen(props.id);
    const stopEvents = () => props.stopPropagation ?? false;
    const allowDblClick = () => props.openOnDblClick ?? true;
    const stopPropagation = event => {
      if (!stopEvents()) return;
      event.stopPropagation();
    };
    const handleDblClick = event => {
      if (!allowDblClick()) return;
      stopPropagation(event);
      openEditor(props.id, props.value());
    };
    // Read-only display: the compiled fallback span. The compiled output used
    // delegated events; direct listeners are the vanilla equivalent. Text and
    // class update in nested render effects so the span never remounts on a
    // value or class change, exactly like the compiled insert()/className().
    const buildDisplay = () => {
      const el = document.createElement("span");
      el.addEventListener("touchstart", stopPropagation);
      el.addEventListener("click", stopPropagation);
      el.addEventListener("mousedown", stopPropagation);
      el.addEventListener("pointerdown", stopPropagation);
      el.addEventListener("dblclick", handleDblClick);
      createRenderEffect(() => {
        const value = props.value();
        el.textContent = value == null || value === true || value === false ? "" : String(value);
      });
      createRenderEffect(() => {
        const name = props.displayClass ?? props.class;
        if (name == null) el.removeAttribute("class");
        else el.className = name;
      });
      return el;
    };
    // Edit mode: a fresh InlineInput per open, so the rAF focus ref re-runs
    // every time the editor is (re)mounted.
    const buildInput = () => createComponent(InlineInput, {
      ref: el => {
        if (frame !== undefined) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          frame = undefined;
          if (!el.isConnected) return;
          el.focus();
        });
      },
      get value() {
        return editorValue();
      },
      get ["class"]() {
        return props.class;
      },
      onInput: event => setEditor("value", event.currentTarget.value),
      onKeyDown: event => {
        event.stopPropagation();
        editorKeyDown(event, props.onSave);
      },
      onBlur: closeEditor,
      onPointerDown: stopPropagation,
      onClick: stopPropagation,
      onDblClick: stopPropagation,
      onMouseDown: stopPropagation,
      onMouseUp: stopPropagation,
      onTouchStart: stopPropagation
    });
    // Show equivalent: a truthiness-deduped condition feeding a memo, so a
    // branch only remounts when editing actually toggles. Callers consume the
    // returned accessor reactively (compiled Show returned a memo as well),
    // and branch-local effects are owned by the memo run, disposing on swap.
    const editing = createMemo(() => !!isEditing());
    return createMemo(() => editing() ? buildInput() : buildDisplay());
  };
  return {
    editor,
    editorOpen,
    editorValue,
    openEditor,
    closeEditor,
    saveEditor,
    editorKeyDown,
    setEditor,
    InlineEditor
  };
}
