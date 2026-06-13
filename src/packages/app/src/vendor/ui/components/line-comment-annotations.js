import { createComponent, createEffect, createMemo, createRoot, createSignal, onCleanup, Show } from "../../../lib/reactivity.js";
import { createStore } from "../../../lib/store.js";
// Each annotation gets its own reactive root (createRoot + the insert()
// exception) mounted into a detached host <div> that the external annotation
// layer adopts. LineComment/LineCommentEditor are Solid components, so they
// need a real root (owner + disposal). This mirrors solid-js/web render()
// exactly, without using anything from solid-js/web beyond insert().
import { insert } from "../../../lib/reactivity.js";
import { useI18n } from "../context/i18n.js";
import { createHoverCommentUtility } from "../pierre/comment-hover.js";
import { cloneSelectedLineRange, formatSelectedLineLabel, lineInSelectedRange } from "../pierre/selection-bridge.js";
import { LineComment, LineCommentEditor } from "./line-comment.js";
export function createLineCommentAnnotationRenderer(props) {
  const nodes = new Map();
  const mount = meta => {
    if (typeof document === "undefined") return;
    const host = document.createElement("div");
    host.setAttribute("data-prevent-autofocus", "");
    const [current, setCurrent] = createSignal(meta);
    const ui = () => {
      const active = current();
      if (active.kind === "comment") {
        const view = createMemo(() => {
          const next = current();
          if (next.kind !== "comment") return props.renderComment(active.comment);
          return props.renderComment(next.comment);
        });
        // Show is the same runtime solid-js component the original used:
        // non-keyed truthiness switching between the rendered comment and its
        // inline editor (a flip disposes and rebuilds the active branch).
        return createComponent(Show, {
          get when() {
            return view().editor;
          },
          get fallback() {
            return createComponent(LineComment, {
              inline: true,
              get id() {
                return view().id;
              },
              get open() {
                return view().open;
              },
              get comment() {
                return view().comment;
              },
              get selection() {
                return view().selection;
              },
              get actions() {
                return view().actions;
              },
              get onClick() {
                return view().onClick;
              },
              get onMouseEnter() {
                return view().onMouseEnter;
              }
            });
          },
          get children() {
            return createComponent(LineCommentEditor, {
              inline: true,
              get id() {
                return view().id;
              },
              get value() {
                return view().editor.value;
              },
              get selection() {
                return view().editor.selection;
              },
              get onInput() {
                return view().editor.onInput;
              },
              get onCancel() {
                return view().editor.onCancel;
              },
              get onSubmit() {
                return view().editor.onSubmit;
              },
              get onPopoverFocusOut() {
                return view().editor.onPopoverFocusOut;
              },
              get cancelLabel() {
                return view().editor.cancelLabel;
              },
              get submitLabel() {
                return view().editor.submitLabel;
              },
              get mention() {
                return view().editor.mention;
              }
            });
          }
        });
      }
      const view = createMemo(() => {
        const next = current();
        if (next.kind !== "draft") return props.renderDraft(active.range);
        return props.renderDraft(next.range);
      });
      return createComponent(LineCommentEditor, {
        inline: true,
        get value() {
          return view().value;
        },
        get selection() {
          return view().selection;
        },
        get onInput() {
          return view().onInput;
        },
        get onCancel() {
          return view().onCancel;
        },
        get onSubmit() {
          return view().onSubmit;
        },
        get onPopoverFocusOut() {
          return view().onPopoverFocusOut;
        },
        get mention() {
          return view().mention;
        }
      });
    };
    // render(ui, host) equivalent: one unowned root per annotation; insert()
    // keeps the component output live, dispose also empties the host.
    let disposer;
    createRoot(d => {
      disposer = d;
      insert(host, ui());
    });
    const dispose = () => {
      disposer();
      host.textContent = "";
    };
    const node = {
      host,
      dispose,
      setMeta: setCurrent
    };
    nodes.set(meta.key, node);
    return node;
  };
  const render = annotation => {
    const meta = annotation.metadata;
    const node = nodes.get(meta.key) ?? mount(meta);
    if (!node) return;
    node.setMeta(meta);
    return node.host;
  };
  const reconcile = annotations => {
    const next = new Set(annotations.map(annotation => annotation.metadata.key));
    for (const [key, node] of nodes) {
      if (next.has(key)) continue;
      node.dispose();
      nodes.delete(key);
    }
  };
  const cleanup = () => {
    for (const [, node] of nodes) node.dispose();
    nodes.clear();
  };
  return {
    render,
    reconcile,
    cleanup
  };
}
export function createLineCommentState(props) {
  const [state, setState] = createStore({
    draft: "",
    editing: null
  });
  const draft = () => state.draft;
  const setDraft = value => setState("draft", value);
  const editing = () => state.editing;
  const setEditing = value => setState("editing", typeof value === "function" ? () => value : value);
  const toRange = range => range ? cloneSelectedLineRange(range) : null;
  const setSelected = range => {
    const next = toRange(range);
    props.setSelected(next);
    props.syncSelected?.(toRange(next));
    return next;
  };
  const setCommenting = range => {
    const next = toRange(range);
    props.setCommenting(next);
    return next;
  };
  const closeComment = () => {
    props.setOpened(null);
  };
  const cancelDraft = () => {
    setDraft("");
    setEditing(null);
    setCommenting(null);
  };
  const reset = () => {
    setDraft("");
    setEditing(null);
    props.setOpened(null);
    props.setSelected(null);
    props.setCommenting(null);
  };
  const openComment = (id, range, options) => {
    if (options?.cancelDraft) cancelDraft();
    props.setOpened(id);
    setSelected(range);
  };
  const toggleComment = (id, range, options) => {
    if (options?.cancelDraft) cancelDraft();
    const next = props.opened() === id ? null : id;
    props.setOpened(next);
    setSelected(range);
  };
  const openDraft = range => {
    const next = toRange(range);
    setDraft("");
    setEditing(null);
    closeComment();
    setSelected(next);
    setCommenting(next);
  };
  const openEditor = (id, range, value) => {
    closeComment();
    setSelected(range);
    props.setCommenting(null);
    setEditing(id);
    setDraft(value);
  };
  const hoverComment = range => {
    const next = toRange(range);
    if (!next) return;
    if (props.hoverSelected) {
      props.hoverSelected(next);
      return;
    }
    setSelected(next);
  };
  const finishSelection = range => {
    closeComment();
    setSelected(range);
    cancelDraft();
  };
  return {
    draft,
    setDraft,
    editing,
    opened: props.opened,
    selected: props.selected,
    commenting: props.commenting,
    isOpen: id => props.opened() === id,
    isEditing: id => editing() === id,
    closeComment,
    openComment,
    toggleComment,
    openDraft,
    openEditor,
    hoverComment,
    cancelDraft,
    finishSelection,
    select: setSelected,
    reset
  };
}
export function createLineCommentController(props) {
  const i18n = useI18n();
  const note = createLineCommentState(props.state);
  const annotations = "getSide" in props ? createLineCommentAnnotations({
    comments: props.comments,
    getCommentId: comment => comment.id,
    getCommentSelection: comment => comment.selection,
    draftRange: note.commenting,
    draftKey: props.draftKey,
    getSide: props.getSide
  }) : createLineCommentAnnotations({
    comments: props.comments,
    getCommentId: comment => comment.id,
    getCommentSelection: comment => comment.selection,
    draftRange: note.commenting,
    draftKey: props.draftKey
  });
  const {
    renderAnnotation
  } = createManagedLineCommentAnnotationRenderer({
    annotations,
    renderComment: comment => {
      const edit = () => note.openEditor(comment.id, comment.selection, comment.comment);
      const remove = () => {
        note.reset();
        props.onDelete?.(comment);
      };
      return {
        id: comment.id,
        get open() {
          return note.isOpen(comment.id) || note.isEditing(comment.id);
        },
        comment: comment.comment,
        selection: formatSelectedLineLabel(comment.selection, i18n.t),
        get actions() {
          return props.renderCommentActions?.(comment, {
            edit,
            remove
          });
        },
        get editor() {
          return note.isEditing(comment.id) ? {
            get value() {
              return note.draft();
            },
            selection: formatSelectedLineLabel(comment.selection, i18n.t),
            mention: props.mention,
            onInput: note.setDraft,
            onCancel: note.cancelDraft,
            onSubmit: value => {
              props.onUpdate?.({
                id: comment.id,
                comment: value,
                selection: cloneSelectedLineRange(comment.selection)
              });
              note.cancelDraft();
            },
            submitLabel: props.editSubmitLabel
          } : undefined;
        },
        onMouseEnter: () => note.hoverComment(comment.selection),
        onClick: () => {
          if (note.isEditing(comment.id)) return;
          note.toggleComment(comment.id, comment.selection, {
            cancelDraft: props.cancelDraftOnCommentToggle
          });
        }
      };
    },
    renderDraft: range => ({
      get value() {
        return note.draft();
      },
      selection: formatSelectedLineLabel(range, i18n.t),
      mention: props.mention,
      onInput: note.setDraft,
      onCancel: note.cancelDraft,
      onSubmit: comment => {
        props.onSubmit({
          comment,
          selection: cloneSelectedLineRange(range)
        });
        note.cancelDraft();
      },
      onPopoverFocusOut: props.onDraftPopoverFocusOut
    })
  });
  const renderHoverUtility = createLineCommentHoverRenderer({
    label: props.label,
    getSelectedRange: () => {
      if (note.opened()) return null;
      return props.getHoverSelectedRange?.() ?? note.selected();
    },
    onOpenDraft: note.openDraft
  });
  const onLineSelected = range => {
    if (!range) {
      note.select(null);
      note.cancelDraft();
      return;
    }
    note.select(range);
  };
  const onLineSelectionEnd = range => {
    if (!range) {
      if (props.clearSelectionOnSelectionEndNull) note.select(null);
      note.cancelDraft();
      return;
    }
    note.finishSelection(range);
  };
  const onLineNumberSelectionEnd = range => {
    if (!range) return;
    note.openDraft(range);
  };
  return {
    note,
    annotations,
    renderAnnotation,
    renderHoverUtility,
    onLineSelected,
    onLineSelectionEnd,
    onLineNumberSelectionEnd
  };
}
export function createLineCommentAnnotations(props) {
  const line = range => Math.max(range.start, range.end);
  if ("getSide" in props) {
    return createMemo(() => {
      const list = props.comments().map(comment => {
        const range = props.getCommentSelection(comment);
        return {
          side: props.getSide(range),
          lineNumber: line(range),
          metadata: {
            kind: "comment",
            key: `comment:${props.getCommentId(comment)}`,
            comment
          }
        };
      });
      const range = props.draftRange();
      if (!range) return list;
      return [...list, {
        side: props.getSide(range),
        lineNumber: line(range),
        metadata: {
          kind: "draft",
          key: `draft:${props.draftKey()}`,
          range
        }
      }];
    });
  }
  return createMemo(() => {
    const list = props.comments().map(comment => {
      const range = props.getCommentSelection(comment);
      const entry = {
        lineNumber: line(range),
        metadata: {
          kind: "comment",
          key: `comment:${props.getCommentId(comment)}`,
          comment
        }
      };
      return entry;
    });
    const range = props.draftRange();
    if (!range) return list;
    const draft = {
      lineNumber: line(range),
      metadata: {
        kind: "draft",
        key: `draft:${props.draftKey()}`,
        range
      }
    };
    return [...list, draft];
  });
}
export function createManagedLineCommentAnnotationRenderer(props) {
  const renderer = createLineCommentAnnotationRenderer({
    renderComment: props.renderComment,
    renderDraft: props.renderDraft
  });
  createEffect(() => {
    renderer.reconcile(props.annotations());
  });
  onCleanup(() => {
    renderer.cleanup();
  });
  return {
    renderAnnotation: renderer.render
  };
}
export function createLineCommentHoverRenderer(props) {
  return getHoveredLine => createHoverCommentUtility({
    label: props.label,
    getHoveredLine,
    onSelect: hovered => {
      const current = props.getSelectedRange();
      if (current && lineInSelectedRange(current, hovered.lineNumber, hovered.side)) {
        props.onOpenDraft(cloneSelectedLineRange(current));
        return;
      }
      const range = {
        start: hovered.lineNumber,
        end: hovered.lineNumber
      };
      if (hovered.side) range.side = hovered.side;
      props.onOpenDraft(range);
    }
  });
}