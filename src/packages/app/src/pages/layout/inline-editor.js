import { createComponent, createMemo, createRenderEffect, onCleanup } from "../../lib/reactivity.js";
import { createStore } from "../../lib/store.js";
import { InlineInput } from "@/vendor/ui/components/inline-input.js";
export function createInlineEditorController() {
  // This controller intentionally supports one active inline editor at a time.
  const [editor, setEditor] = createStore({
    active: "",
    value: ""
  });
  const editorOpen = id => editor.active === id;
  const editorValue = () => editor.value;
  const openEditor = (id, value) => {
    if (!id) return;
    setEditor({
      active: id,
      value
    });
  };
  const closeEditor = () => setEditor({
    active: "",
    value: ""
  });
  const saveEditor = callback => {
    const next = editor.value.trim();
    if (!next) {
      closeEditor();
      return;
    }
    closeEditor();
    callback(next);
  };
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
