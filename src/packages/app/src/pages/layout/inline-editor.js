import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span>`);
import { createStore } from "solid-js/store";
import { onCleanup, Show } from "solid-js";
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
    return _$createComponent(Show, {
      get when() {
        return isEditing();
      },
      get fallback() {
        return (() => {
          var _el$ = _tmpl$();
          _el$.$$touchstart = stopPropagation;
          _el$.$$click = stopPropagation;
          _el$.$$mousedown = stopPropagation;
          _el$.$$pointerdown = stopPropagation;
          _el$.$$dblclick = handleDblClick;
          _$insert(_el$, () => props.value());
          _$effect(() => _$className(_el$, props.displayClass ?? props.class));
          return _el$;
        })();
      },
      get children() {
        return _$createComponent(InlineInput, {
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
      }
    });
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
_$delegateEvents(["dblclick", "pointerdown", "mousedown", "click", "touchstart"]);