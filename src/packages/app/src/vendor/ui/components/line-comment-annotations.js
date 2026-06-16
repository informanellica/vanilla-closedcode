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
/** @file Line-comment annotation orchestration: per-annotation reactive renderer, comment/draft state machine, and the controller wiring them to a diff/code view. */

/**
 * Create a renderer that mounts each line-comment/draft annotation into its own
 * detached reactive root host element, keyed by annotation metadata.
 *
 * Each annotation flips between a rendered comment (LineComment) and its inline
 * editor (LineCommentEditor) via a Show, or renders a draft editor. Hosts are
 * reused across renders by key, reconciled against the live set, and disposed on
 * cleanup.
 *
 * @param {Object} props - Renderer props.
 * @param {Function} props.renderComment - Maps a comment to its view model (id, open, comment, selection, actions, editor, handlers).
 * @param {Function} props.renderDraft - Maps a draft range to its editor view model.
 * @returns {Object} Renderer with render(annotation), reconcile(annotations), and cleanup() methods.
 */
export function createLineCommentAnnotationRenderer(props) {
  const nodes = new Map();
  /**
   * Mount a new annotation node: build a reactive root in a detached host that
   * renders the comment/editor or draft editor for the given metadata.
   *
   * @param {Object} meta - Annotation metadata (kind "comment" or "draft", key, and comment/range).
   * @returns {Object} The created node { host, dispose, setMeta }, or undefined when no document.
   */
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
  /**
   * Render (or update) the host element for one annotation, reusing the existing
   * keyed node or mounting a new one.
   *
   * @param {Object} annotation - Annotation with a metadata key and payload.
   * @returns {(HTMLElement|undefined)} The host element, or undefined when no document.
   */
  const render = annotation => {
    const meta = annotation.metadata;
    const node = nodes.get(meta.key) ?? mount(meta);
    if (!node) return;
    node.setMeta(meta);
    return node.host;
  };
  /**
   * Dispose and remove any mounted annotation nodes whose keys are no longer in
   * the provided list.
   *
   * @param {Array} annotations - The current set of annotations to keep.
   * @returns {void}
   */
  const reconcile = annotations => {
    const next = new Set(annotations.map(annotation => annotation.metadata.key));
    for (const [key, node] of nodes) {
      if (next.has(key)) continue;
      node.dispose();
      nodes.delete(key);
    }
  };
  /**
   * Dispose every mounted annotation node and clear the registry.
   *
   * @returns {void}
   */
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
/**
 * Create the line-comment interaction state machine: tracks the draft text and
 * the comment currently being edited, and exposes actions to open/close/toggle
 * comments, start drafts and editors, handle hover/selection, and reset. Opened,
 * selected, and commenting ranges are delegated to the provided host accessors
 * and setters.
 *
 * @param {Object} props - Host bindings.
 * @param {Function} props.opened - Accessor for the currently opened comment id.
 * @param {Function} props.selected - Accessor for the currently selected line range.
 * @param {Function} props.commenting - Accessor for the active draft range.
 * @param {Function} props.setOpened - Setter for the opened comment id.
 * @param {Function} props.setSelected - Setter for the selected range.
 * @param {Function} props.setCommenting - Setter for the draft range.
 * @param {Function} props.syncSelected - Optional secondary sync for the selected range.
 * @param {Function} props.hoverSelected - Optional override for hover selection handling.
 * @returns {Object} The state API (draft, editing, opened, selected, commenting, isOpen, isEditing, and action methods).
 */
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
/**
 * Create the high-level line-comment controller that ties the state machine, the
 * annotations memo, the managed annotation renderer, and the hover utility
 * together, exposing the line-selection callbacks a diff/code view drives.
 *
 * Builds view models for each comment (with edit/remove actions and an inline
 * editor) and for the active draft, wiring submit/update/delete callbacks. When
 * props.getSide is present the annotations are split-diff aware.
 *
 * @param {Object} props - Controller configuration.
 * @param {Object} props.state - Host bindings forwarded to createLineCommentState.
 * @param {Function} props.comments - Accessor returning the list of comments.
 * @param {Function} props.draftKey - Accessor returning a stable key for the current draft.
 * @param {Function} props.getSide - Optional accessor mapping a range to a diff side (split-diff mode).
 * @param {Function} props.onSubmit - Called with { comment, selection } when a draft is submitted.
 * @param {Function} props.onUpdate - Called with { id, comment, selection } when an edit is saved.
 * @param {Function} props.onDelete - Called with the comment when it is removed.
 * @param {Function} props.renderCommentActions - Builds the action UI for a comment given { edit, remove }.
 * @param {Function} props.getHoverSelectedRange - Optional accessor for the hover-selected range.
 * @param {Object} props.mention - Mention configuration passed to editors.
 * @param {string} props.label - Hover utility label.
 * @param {string} props.editSubmitLabel - Submit label for the edit editor.
 * @param {boolean} props.cancelDraftOnCommentToggle - Whether toggling a comment cancels an open draft.
 * @param {boolean} props.clearSelectionOnSelectionEndNull - Whether a null selection-end clears the selection.
 * @param {Function} props.onDraftPopoverFocusOut - Focus-out handler for the draft popover.
 * @returns {Object} Controller with note, annotations, renderAnnotation, renderHoverUtility, and line-selection callbacks.
 */
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
/**
 * Build a memo producing the annotation list from the comments plus any active
 * draft range. Each entry carries a line number and metadata (kind, key,
 * comment/range); when props.getSide is present, entries also include a diff
 * side for split-diff rendering.
 *
 * @param {Object} props - Annotation source bindings.
 * @param {Function} props.comments - Accessor returning the list of comments.
 * @param {Function} props.getCommentId - Maps a comment to its id.
 * @param {Function} props.getCommentSelection - Maps a comment to its line range.
 * @param {Function} props.draftRange - Accessor returning the active draft range or null.
 * @param {Function} props.draftKey - Accessor returning a stable key for the draft.
 * @param {Function} props.getSide - Optional accessor mapping a range to a diff side.
 * @returns {Function} A memo accessor returning the array of annotation entries.
 */
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
/**
 * Wrap a line-comment annotation renderer with reactive lifecycle management:
 * reconciles the renderer against the annotations memo on every change and
 * disposes everything on cleanup.
 *
 * @param {Object} props - Configuration.
 * @param {Function} props.annotations - Accessor returning the current annotation list.
 * @param {Function} props.renderComment - Comment view-model factory (forwarded to the renderer).
 * @param {Function} props.renderDraft - Draft view-model factory (forwarded to the renderer).
 * @returns {Object} An object with renderAnnotation, the renderer's render function.
 */
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
/**
 * Create a factory for the hover-comment utility: given a hovered-line accessor,
 * builds a utility that, on select, either opens a draft for the existing
 * selected range (when the hovered line falls inside it) or opens a fresh
 * single-line draft.
 *
 * @param {Object} props - Configuration.
 * @param {string} props.label - Label shown by the hover utility.
 * @param {Function} props.getSelectedRange - Accessor returning the current selected range or null.
 * @param {Function} props.onOpenDraft - Called with the range to open a draft for.
 * @returns {Function} A function taking a hovered-line accessor and returning the hover utility.
 */
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