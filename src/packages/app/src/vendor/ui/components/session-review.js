import { Accordion } from "./accordion.js";
import { Button } from "./button.js";
import { DropdownMenu } from "./dropdown-menu.js";
import { RadioGroup } from "./radio-group.js";
import { DiffChanges } from "./diff-changes.js";
import { FileIcon } from "./file-icon.js";
import { Icon } from "./icon.js";
import { IconButton } from "./icon-button.js";
import { StickyAccordionHeader } from "./sticky-accordion-header.js";
import { ScrollView } from "./scroll-view.js";
import { useFileComponent } from "../context/file.js";
import { useI18n } from "../context/i18n.js";
import { getDirectory, getFilename } from "core/util/path";
import { checksum } from "core/util/encode";
import { createComponent, createEffect, createMemo, createRenderEffect, For, Match, onCleanup, Show, Switch, untrack } from "../../../lib/reactivity.js";
import { createStore } from "../../../lib/store.js";
// insert() is the established exception for reactive/component-valued children
// (most of them rendered inside presence-gated Accordion content) so
// Solid keeps reconciling accessors instead of freezing them.
import { insert } from "../../../lib/reactivity.js";
import { mediaKindFromPath } from "../pierre/media.js";
import { cloneSelectedLineRange, previewSelectedLines } from "../pierre/selection-bridge.js";
import { createLineCommentController } from "./line-comment-annotations.js";
import { normalize, text } from "./session-diff.js";
const MAX_DIFF_CHANGED_LINES = 500;
const REVIEW_MOUNT_MARGIN = 300;

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Static markup only — translated or
// user-controlled strings are always assigned via textContent, never
// interpolated. Built fresh per call: no cloneNode (listeners survive).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Diff-based classList application, mirroring solid-js/web classList(): only
// keys whose truthiness changed are toggled; space-separated keys supported.
function applyClassList(el, value, prev) {
  const prevObj = prev || {};
  const nextObj = value || {};
  for (const name of Object.keys(prevObj)) {
    if (!name || name in nextObj || !prevObj[name]) continue;
    for (const cls of name.trim().split(/\s+/)) {
      if (cls) el.classList.remove(cls);
    }
  }
  for (const name of Object.keys(nextObj)) {
    const on = !!nextObj[name];
    if (!name || on === !!prevObj[name]) continue;
    for (const cls of name.trim().split(/\s+/)) {
      if (cls) el.classList.toggle(cls, on);
    }
  }
  return { ...nextObj };
}
function diff(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!("file" in value) || typeof value.file !== "string") return false;
  if (!("additions" in value) || typeof value.additions !== "number") return false;
  if (!("deletions" in value) || typeof value.deletions !== "number") return false;
  if ("patch" in value && value.patch !== undefined && typeof value.patch !== "string") return false;
  if ("before" in value && value.before !== undefined && typeof value.before !== "string") return false;
  if ("after" in value && value.after !== undefined && typeof value.after !== "string") return false;
  if (!("status" in value) || value.status === undefined) return true;
  return value.status === "added" || value.status === "deleted" || value.status === "modified";
}
function list(value) {
  if (Array.isArray(value) && value.every(diff)) return value;
  if (Array.isArray(value)) return value.filter(diff);
  if (diff(value)) return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).filter(diff);
}
function ReviewCommentMenu(props) {
  const root = template(`<div></div>`);
  // The compiled output registered these as *delegated* $$click/$$mousedown
  // handlers: their stopPropagation suppressed ancestor handlers during the
  // document-level delegation walk — in particular the LineComment popover's
  // own click (open/focus) and mousedown handlers. Those ancestors now attach
  // native listeners (line-comment.js is converted), so a native
  // stopPropagation here reproduces the same suppression at the same scope.
  root.addEventListener("click", event => event.stopPropagation());
  root.addEventListener("mousedown", event => event.stopPropagation());
  // The original component tree (portal + presence-gated content): insert() keeps
  // its accessor output live, exactly like the compiled insert().
  insert(root, createComponent(DropdownMenu, {
    gutter: 4,
    placement: "bottom-end",
    get children() {
      return [createComponent(DropdownMenu.Trigger, {
        as: IconButton,
        icon: "dot-grid",
        variant: "ghost",
        size: "small",
        "class": "size-6 rounded-2",
        get ["aria-label"]() {
          return props.labels.moreLabel;
        }
      }), createComponent(DropdownMenu.Portal, {
        get children() {
          return createComponent(DropdownMenu.Content, {
            get children() {
              return [createComponent(DropdownMenu.Item, {
                get onSelect() {
                  return props.onEdit;
                },
                get children() {
                  return createComponent(DropdownMenu.ItemLabel, {
                    get children() {
                      return props.labels.editLabel;
                    }
                  });
                }
              }), createComponent(DropdownMenu.Item, {
                get onSelect() {
                  return props.onDelete;
                },
                get children() {
                  return createComponent(DropdownMenu.ItemLabel, {
                    get children() {
                      return props.labels.deleteLabel;
                    }
                  });
                }
              })];
            }
          });
        }
      })];
    }
  }));
  return root;
}
function diffId(file) {
  const sum = checksum(file);
  if (!sum) return;
  return `session-review-diff-${sum}`;
}
export const SessionReview = props => {
  let scroll;
  let focusToken = 0;
  let frame;
  const i18n = useI18n();
  const fileComponent = useFileComponent();
  const anchors = new Map();
  const nodes = new Map();
  const [store, setStore] = createStore({
    open: [],
    visible: {},
    force: {},
    selection: null,
    commenting: null,
    opened: null
  });
  const selection = () => store.selection;
  const commenting = () => store.commenting;
  const opened = () => store.opened;
  const open = () => props.open ?? store.open;
  const items = createMemo(() => list(props.diffs).map(diff => ({
    ...normalize(diff),
    preloaded: diff.preloaded
  })));
  const files = createMemo(() => items().map(diff => diff.file));
  const grouped = createMemo(() => {
    const next = new Map();
    for (const comment of props.comments ?? []) {
      const list = next.get(comment.file);
      if (list) {
        list.push(comment);
        continue;
      }
      next.set(comment.file, [comment]);
    }
    return next;
  });
  const diffStyle = () => props.diffStyle ?? (props.split ? "split" : "unified");
  const hasDiffs = () => files().length > 0;
  const syncVisible = () => {
    frame = undefined;
    if (!scroll) return;
    const root = scroll.getBoundingClientRect();
    const top = root.top - REVIEW_MOUNT_MARGIN;
    const bottom = root.bottom + REVIEW_MOUNT_MARGIN;
    const openSet = new Set(open());
    const next = {};
    for (const [file, el] of nodes) {
      if (!openSet.has(file)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.bottom < top || rect.top > bottom) continue;
      next[file] = true;
    }
    const prev = untrack(() => store.visible);
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    if (prevKeys.length === nextKeys.length && nextKeys.every(file => prev[file])) return;
    setStore("visible", next);
  };
  const queue = () => {
    if (frame !== undefined) return;
    // Schedule via setTimeout, NOT requestAnimationFrame: rAF callbacks are
    // paused while the window is occluded/hidden (document.visibilityState
    // === "hidden"), so a rAF-gated syncVisible never runs in that state and
    // every expanded diff is stuck on its placeholder (never marked visible ->
    // mounted() stays false -> blank box). setTimeout fires regardless of
    // visibility, and getBoundingClientRect still reports correct layout, so
    // visibility is computed reliably whether or not the window is painting.
    frame = setTimeout(syncVisible, 0);
  };
  const pinned = file => props.focusedComment?.file === file || props.focusedFile === file || selection()?.file === file || commenting()?.file === file || opened()?.file === file;
  const handleScroll = event => {
    queue();
    const next = props.onScroll;
    if (!next) return;
    if (Array.isArray(next)) {
      const [fn, data] = next;
      fn(data, event);
      return;
    }
    ;
    next(event);
  };
  onCleanup(() => {
    if (frame === undefined) return;
    clearTimeout(frame);
  });
  createEffect(() => {
    props.open;
    files();
    queue();
  });
  const handleChange = next => {
    props.onOpenChange?.(next);
    if (props.open === undefined) setStore("open", next);
    queue();
  };
  const handleExpandOrCollapseAll = () => {
    const next = open().length > 0 ? [] : files();
    handleChange(next);
  };
  const openFileLabel = () => i18n.t("ui.sessionReview.openFile");
  const selectionSide = range => range.endSide ?? range.side ?? "additions";
  const selectionPreview = (diff, range) => {
    const side = selectionSide(range);
    const contents = text(diff, side);
    if (contents.length === 0) return undefined;
    return previewSelectedLines(contents, range);
  };
  createEffect(() => {
    const focus = props.focusedComment;
    if (!focus) return;
    untrack(() => {
      focusToken++;
      const token = focusToken;
      setStore("opened", focus);
      const comment = (props.comments ?? []).find(c => c.file === focus.file && c.id === focus.id);
      if (comment) setStore("selection", {
        file: comment.file,
        range: cloneSelectedLineRange(comment.selection)
      });
      const current = open();
      if (!current.includes(focus.file)) {
        handleChange([...current, focus.file]);
      }
      const scrollTo = attempt => {
        if (token !== focusToken) return;
        const root = scroll;
        if (!root) return;
        const wrapper = anchors.get(focus.file);
        const anchor = wrapper?.querySelector(`[data-comment-id="${focus.id}"]`);
        const ready = anchor instanceof HTMLElement && anchor.style.pointerEvents !== "none" && anchor.style.opacity !== "0";
        const target = ready ? anchor : wrapper;
        if (!target) {
          if (attempt >= 120) return;
          requestAnimationFrame(() => scrollTo(attempt + 1));
          return;
        }
        const rootRect = root.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const offset = targetRect.top - rootRect.top;
        const next = root.scrollTop + offset - rootRect.height / 2 + targetRect.height / 2;
        root.scrollTop = Math.max(0, next);
        if (ready) return;
        if (attempt >= 120) return;
        requestAnimationFrame(() => scrollTo(attempt + 1));
      };
      requestAnimationFrame(() => scrollTo(0));
      requestAnimationFrame(() => props.onFocusedCommentChange?.(null));
    });
  });
  // Static skeleton (compiled _tmpl$4): root > header > title + actions.
  const root = template(`<div data-component="session-review"><div data-slot="session-review-header"><div data-slot="session-review-title"></div><div data-slot="session-review-actions"></div></div></div>`);
  const header = root.firstChild;
  const titleEl = header.firstChild;
  const actionsEl = titleEl.nextSibling;
  // Title: props.title may be any renderable (component, string, null), so it
  // goes through insert(); the memo mirrors the compiled condition wrapper.
  const defaultTitle = createMemo(() => props.title === undefined);
  insert(titleEl, () => defaultTitle() ? i18n.t("ui.sessionReview.title") : props.title);
  // Actions: three dynamic regions appended in order; each insert() with a
  // null marker tracks its own nodes, like the compiled inserts.
  insert(actionsEl, createComponent(Show, {
    get when() {
      return hasDiffs() && props.onDiffStyleChange;
    },
    get children() {
      return createComponent(RadioGroup, {
        options: ["unified", "split"],
        get current() {
          return diffStyle();
        },
        size: "small",
        value: style => style,
        label: style => i18n.t(style === "unified" ? "ui.sessionReview.diffStyle.unified" : "ui.sessionReview.diffStyle.split"),
        onSelect: style => style && props.onDiffStyleChange?.(style)
      });
    }
  }), null);
  insert(actionsEl, createComponent(Show, {
    get when() {
      return hasDiffs();
    },
    get children() {
      // Icon-only toggle: a text label ("すべて折りたたむ" / "Expand all") cannot
      // fit alongside the Unified/Split radio group in a narrow review panel and
      // was being clipped at the panel edge. The glyph SWITCHES with state
      // (arrows-collapse when expanded, arrows-expand when collapsed) so the
      // action reads clearly, and stays discoverable + accessible via a reactive
      // aria-label + native title tooltip (no portaled Tooltip, so nothing can
      // be left orphaned in the body).
      const button = createComponent(Button, {
        size: "small",
        "class": "shrink-0",
        onClick: handleExpandOrCollapseAll
      });
      const icon = createComponent(Icon, {
        name: "expand",
        size: "small"
      });
      button.appendChild(icon);
      createRenderEffect(() => {
        const collapsing = open().length > 0;
        icon.classList.toggle("bi-arrows-collapse", collapsing);
        icon.classList.toggle("bi-arrows-expand", !collapsing);
        const label = i18n.t(collapsing ? "ui.sessionReview.collapseAll" : "ui.sessionReview.expandAll");
        button.setAttribute("aria-label", label);
        button.setAttribute("title", label);
      });
      return button;
    }
  }), null);
  insert(actionsEl, () => props.actions, null);
  // ScrollView is a vanilla component returning a concrete element; appended
  // after the header like the compiled insert with a null marker.
  root.appendChild(createComponent(ScrollView, {
    "data-slot": "session-review-scroll",
    viewportRef: el => {
      scroll = el;
      props.scrollRef?.(el);
      queue();
    },
    onScroll: handleScroll,
    get classList() {
      return {
        [props.classes?.root ?? ""]: !!props.classes?.root
      };
    },
    get children() {
      const container = template(`<div data-slot="session-review-container"></div>`);
      insert(container, createComponent(Show, {
        get when() {
          return hasDiffs();
        },
        get fallback() {
          return props.empty;
        },
        get children() {
          const listEl = template(`<div class="pb-6"></div>`);
          insert(listEl, createComponent(Accordion, {
            multiple: true,
            get value() {
              return open();
            },
            onChange: handleChange,
            get children() {
              return createComponent(For, {
                get each() {
                  return items();
                },
                children: diff => {
                    const file = diff.file;

                    // Renderable when there are line changes OR the file is wholly
                    // added/deleted. Added/deleted files carry 0 in their additions/
                    // deletions metadata (those counts come from the patch, which
                    // streams in later) yet are perfectly renderable — as a full
                    // add/remove diff, or an image preview for media. Gating only on
                    // the line counts left added files with no chevron and no
                    // accordion value, so they couldn't be expanded individually.
                    // Binary *modified* files with no diff and no media stay excluded.
                    const diffCanRender = () => diff.additions !== 0 || diff.deletions !== 0 || diff.status === "added" || diff.status === "deleted";
                    const expanded = createMemo(() => open().includes(file));
                    // Mount the diff as soon as it is expanded. The previous
                    // viewport-virtualization gate (expanded && store.visible[file])
                    // depended on syncVisible writing store.visible — a chain that
                    // proved fragile (rAF pauses while occluded; the store-visible
                    // signal not reliably re-flipping mounted()), repeatedly leaving
                    // expanded diffs stuck on their blank placeholder. A review has
                    // few files and very large diffs are still deferred behind
                    // tooLarge()'s "render anyway", so mounting on expand is safe and
                    // removes the blank-preview failure mode entirely. pinned() is
                    // subsumed: focusing a comment opens (expands) its file.
                    const mounted = expanded;
                    const force = () => !!store.force[file];
                    const comments = createMemo(() => grouped().get(file) ?? []);
                    const commentedLines = createMemo(() => comments().map(c => c.selection));
                    const beforeText = () => text(diff, "deletions");
                    const afterText = () => text(diff, "additions");
                    const changedLines = () => diff.additions + diff.deletions;
                    const mediaKind = createMemo(() => mediaKindFromPath(file));
                    const tooLarge = createMemo(() => {
                      if (!expanded()) return false;
                      if (force()) return false;
                      if (mediaKind()) return false;
                      return changedLines() > MAX_DIFF_CHANGED_LINES;
                    });
                    const isAdded = () => diff.status === "added" || beforeText().length === 0 && afterText().length > 0;
                    const isDeleted = () => diff.status === "deleted" || afterText().length === 0 && beforeText().length > 0;
                    const selectedLines = createMemo(() => {
                      const current = selection();
                      if (!current || current.file !== file) return null;
                      return current.range;
                    });
                    const draftRange = createMemo(() => {
                      const current = commenting();
                      if (!current || current.file !== file) return null;
                      return current.range;
                    });
                    const commentsUi = createLineCommentController({
                      comments,
                      label: i18n.t("ui.lineComment.submit"),
                      draftKey: () => file,
                      mention: props.lineCommentMention,
                      state: {
                        opened: () => {
                          const current = opened();
                          if (!current || current.file !== file) return null;
                          return current.id;
                        },
                        setOpened: id => setStore("opened", id ? {
                          file,
                          id
                        } : null),
                        selected: selectedLines,
                        setSelected: range => setStore("selection", range ? {
                          file,
                          range
                        } : null),
                        commenting: draftRange,
                        setCommenting: range => setStore("commenting", range ? {
                          file,
                          range
                        } : null)
                      },
                      getSide: selectionSide,
                      clearSelectionOnSelectionEndNull: false,
                      onSubmit: ({
                        comment,
                        selection
                      }) => {
                        props.onLineComment?.({
                          file,
                          selection,
                          comment,
                          preview: selectionPreview(diff, selection)
                        });
                      },
                      onUpdate: ({
                        id,
                        comment,
                        selection
                      }) => {
                        props.onLineCommentUpdate?.({
                          id,
                          file,
                          selection,
                          comment,
                          preview: selectionPreview(diff, selection)
                        });
                      },
                      onDelete: comment => {
                        props.onLineCommentDelete?.({
                          id: comment.id,
                          file
                        });
                      },
                      editSubmitLabel: props.lineCommentActions?.saveLabel,
                      renderCommentActions: props.lineCommentActions ? (comment, controls) => createComponent(ReviewCommentMenu, {
                        get labels() {
                          return props.lineCommentActions;
                        },
                        get onEdit() {
                          return controls.edit;
                        },
                        get onDelete() {
                          return controls.remove;
                        }
                      }) : undefined
                    });
                    onCleanup(() => {
                      anchors.delete(file);
                      nodes.delete(file);
                      queue();
                    });
                    const handleLineSelected = range => {
                      if (!props.onLineComment) return;
                      commentsUi.onLineSelected(range);
                    };
                    const handleLineSelectionEnd = range => {
                      if (!props.onLineComment) return;
                      commentsUi.onLineSelectionEnd(range);
                    };
                    return createComponent(Accordion.Item, {
                      get value() {
                        return diffCanRender() ? file : null;
                      },
                      get id() {
                        return diffId(file);
                      },
                      "data-file": file,
                      "data-slot": "session-review-accordion-item",
                      get ["data-selected"]() {
                        return props.focusedFile === file ? "" : undefined;
                      },
                      get children() {
                        return [createComponent(StickyAccordionHeader, {
                          get children() {
                            return createComponent(Accordion.Trigger, {
                              get disabled() {
                                return !diffCanRender();
                              },
                              "class": "cursor-default",
                              get children() {
                                // Static trigger skeleton (compiled _tmpl$1).
                                const content = template(`<div data-slot="session-review-trigger-content"><div data-slot="session-review-file-info"><div data-slot="session-review-file-name-container"><span data-slot="session-review-filename"></span></div></div><div data-slot="session-review-trigger-actions"></div></div>`);
                                const fileInfo = content.firstChild;
                                const nameContainer = fileInfo.firstChild;
                                const filenameEl = nameContainer.firstChild;
                                const triggerActions = fileInfo.nextSibling;
                                // FileIcon goes before the file-name container
                                // (vanilla FileIcon returns a concrete element).
                                fileInfo.insertBefore(createComponent(FileIcon, {
                                  node: {
                                    path: file,
                                    type: "file"
                                  }
                                }), nameContainer);
                                // Show(when file.includes("/")): `file` is
                                // fixed for this row, so the branch is static.
                                // Directory text set via textContent, never
                                // interpolated into markup.
                                if (file.includes("/")) {
                                  const dir = template(`<span data-slot="session-review-directory"></span>`);
                                  dir.textContent = `\u202A${getDirectory(file)}\u202C`;
                                  nameContainer.insertBefore(dir, filenameEl);
                                }
                                filenameEl.textContent = getFilename(file);
                                // Open-file affordance: the filename itself is
                                // the link (the separate open-file icon button
                                // was removed). `file` and diffCanRender() are
                                // fixed per row, so this is decided once at
                                // creation. stopPropagation keeps the click from
                                // toggling the accordion trigger; Enter/Space
                                // mirror the click for keyboard access. No
                                // Tooltip is attached here on purpose -- the
                                // accessible name comes from aria-label, which
                                // avoids the body-portaled tooltip lifecycle.
                                if (!!props.onViewFile && diffCanRender()) {
                                  filenameEl.classList.add("cursor-pointer", "hover:underline");
                                  filenameEl.setAttribute("role", "link");
                                  filenameEl.setAttribute("tabindex", "0");
                                  createRenderEffect(() => filenameEl.setAttribute("aria-label", openFileLabel()));
                                  filenameEl.addEventListener("click", e => {
                                    e.stopPropagation();
                                    props.onViewFile?.(file);
                                  });
                                  filenameEl.addEventListener("keydown", e => {
                                    if (e.key !== "Enter" && e.key !== " ") return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    props.onViewFile?.(file);
                                  });
                                }
                                // Switch over the change type: every condition
                                // depends only on the per-row `diff` object
                                // (rows are recreated when the diff changes),
                                // so the branch is static; only the i18n
                                // labels stay reactive.
                                if (isAdded()) {
                                  const group = template(`<div data-slot="session-review-change-group" data-type="added"><span data-slot="session-review-change" data-type="added"></span></div>`);
                                  const label = group.firstChild;
                                  createRenderEffect(() => {
                                    label.textContent = i18n.t("ui.sessionReview.change.added");
                                  });
                                  // DiffChanges returns a Show-like accessor,
                                  // appended after the label like the compiled
                                  // insert with a null marker.
                                  insert(group, createComponent(DiffChanges, {
                                    changes: diff
                                  }), null);
                                  triggerActions.appendChild(group);
                                } else if (isDeleted()) {
                                  const label = template(`<span data-slot="session-review-change" data-type="removed"></span>`);
                                  createRenderEffect(() => {
                                    label.textContent = i18n.t("ui.sessionReview.change.removed");
                                  });
                                  triggerActions.appendChild(label);
                                } else if (mediaKind()) {
                                  const label = template(`<span data-slot="session-review-change" data-type="modified"></span>`);
                                  createRenderEffect(() => {
                                    label.textContent = i18n.t("ui.sessionReview.change.modified");
                                  });
                                  triggerActions.appendChild(label);
                                } else {
                                  insert(triggerActions, createComponent(DiffChanges, {
                                    changes: diff
                                  }), null);
                                }
                                // Show(when diffCanRender()): static per row.
                                if (diffCanRender()) {
                                  const chevron = template(`<span data-slot="session-review-diff-chevron"></span>`);
                                  chevron.appendChild(createComponent(Icon, {
                                    name: "chevron-down",
                                    size: "small"
                                  }));
                                  triggerActions.appendChild(chevron);
                                }
                                return content;
                              }
                            });
                          }
                        }), createComponent(Accordion.Content, {
                          "data-slot": "session-review-accordion-content",
                          get children() {
                            // Presence-gated content: this getter runs
                            // per mount, exactly like the compiled template.
                            const wrapper = template(`<div data-slot="session-review-diff-wrapper"></div>`);
                            // The compiled use(...) ref ran synchronously at
                            // creation time; inline its body here.
                            anchors.set(file, wrapper);
                            nodes.set(file, wrapper);
                            queue();
                            insert(wrapper, createComponent(Show, {
                              get when() {
                                return expanded();
                              },
                              get children() {
                                return createComponent(Switch, {
                                  get children() {
                                    return [createComponent(Match, {
                                      get when() {
                                        return !mounted() && !tooLarge();
                                      },
                                      get children() {
                                        return template(`<div data-slot="session-review-diff-placeholder" class="rounded-3 border bg-body" style="height:160px"></div>`);
                                      }
                                    }), createComponent(Match, {
                                      get when() {
                                        return tooLarge();
                                      },
                                      get children() {
                                        const large = template(`<div data-slot="session-review-large-diff"><div data-slot="session-review-large-diff-title"></div><div data-slot="session-review-large-diff-meta"></div><div data-slot="session-review-large-diff-actions"></div></div>`);
                                        const largeTitle = large.firstChild;
                                        const largeMeta = largeTitle.nextSibling;
                                        const largeActions = largeMeta.nextSibling;
                                        createRenderEffect(() => {
                                          largeTitle.textContent = i18n.t("ui.sessionReview.largeDiff.title");
                                        });
                                        createRenderEffect(() => {
                                          largeMeta.textContent = i18n.t("ui.sessionReview.largeDiff.meta", {
                                            limit: MAX_DIFF_CHANGED_LINES.toLocaleString(),
                                            current: changedLines().toLocaleString()
                                          });
                                        });
                                        largeActions.appendChild(createComponent(Button, {
                                          size: "normal",
                                          variant: "secondary",
                                          onClick: () => setStore("force", file, true),
                                          // Function child: the vanilla Button
                                          // insert()s it, so the label stays
                                          // live across language switches.
                                          children: () => i18n.t("ui.sessionReview.largeDiff.renderAnyway")
                                        }));
                                        return large;
                                      }
                                    }), createComponent(Match, {
                                      when: true,
                                      get children() {
                                        // fileComponent is the context-provided
                                        // file component. The provider snapshots
                                        // props.component once (createSimpleContext
                                        // init), so the component is static and
                                        // Dynamic is unnecessary: create it
                                        // directly with the same reactive props.
                                        return createComponent(fileComponent, {
                                          mode: "diff",
                                          get fileDiff() {
                                            return diff.fileDiff;
                                          },
                                          get preloadedDiff() {
                                            return diff.preloaded;
                                          },
                                          get diffStyle() {
                                            return diffStyle();
                                          },
                                          onRendered: () => {
                                            props.onDiffRendered?.();
                                          },
                                          get enableLineSelection() {
                                            return props.onLineComment != null;
                                          },
                                          get enableHoverUtility() {
                                            return props.onLineComment != null;
                                          },
                                          onLineSelected: handleLineSelected,
                                          onLineSelectionEnd: handleLineSelectionEnd,
                                          get onLineNumberSelectionEnd() {
                                            return commentsUi.onLineNumberSelectionEnd;
                                          },
                                          get annotations() {
                                            return commentsUi.annotations();
                                          },
                                          get renderAnnotation() {
                                            return commentsUi.renderAnnotation;
                                          },
                                          get renderHoverUtility() {
                                            return props.onLineComment ? commentsUi.renderHoverUtility : undefined;
                                          },
                                          get selectedLines() {
                                            return selectedLines();
                                          },
                                          get commentedLines() {
                                            return commentedLines();
                                          },
                                          get media() {
                                            return {
                                              mode: "auto",
                                              path: file,
                                              deleted: diff.status === "deleted",
                                              readFile: diff.status === "deleted" ? undefined : props.readFile
                                            };
                                          }
                                        });
                                      }
                                    })];
                                  }
                                });
                              }
                            }));
                            return wrapper;
                          }
                        })];
                      }
                    });
                  }
              });
            }
          }));
          return listEl;
        }
      }));
      // className(container, props.classes?.container) ran unguarded in the
      // compiled effect(); keep the same null -> removeAttribute contract.
      createRenderEffect(() => {
        const next = props.classes?.container;
        if (next == null) container.removeAttribute("class");
        else container.className = next;
      });
      return container;
    }
  }));
  // Reactive root/header classes, mirroring the compiled change-guarded
  // effect: className(root, props.class), classList(root, props.classList),
  // className(header, props.classes?.header).
  let prevRootClass;
  let prevRootClassList;
  let prevHeaderClass;
  createRenderEffect(() => {
    const nextClass = props.class;
    const nextClassList = props.classList;
    const nextHeader = props.classes?.header;
    if (nextClass !== prevRootClass) {
      prevRootClass = nextClass;
      if (nextClass == null) root.removeAttribute("class");
      else root.className = nextClass;
    }
    prevRootClassList = applyClassList(root, nextClassList, prevRootClassList);
    if (nextHeader !== prevHeaderClass) {
      prevHeaderClass = nextHeader;
      if (nextHeader == null) header.removeAttribute("class");
      else header.className = nextHeader;
    }
  });
  return root;
};