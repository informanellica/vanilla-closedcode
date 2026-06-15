import { createComponent, createEffect, createMemo, createRenderEffect, createSignal, Match, on, onCleanup, Show, Switch } from "../../lib/reactivity.js";
import { createStore } from "../../lib/store.js";
import { insert } from "../../lib/reactivity.js";
import { makeEventListener } from "../../lib/primitives/event-listener.js";
import { useFileComponent } from "@/vendor/ui/context/file.js";
import { cloneSelectedLineRange, previewSelectedLines } from "@/vendor/ui/pierre/selection-bridge.js";
import { createLineCommentController } from "@/vendor/ui/components/line-comment-annotations.js";
import { sampledChecksum } from "core/util/encode";
import { DropdownMenu } from "@/bs/dropdown-menu.js";
import { IconButton } from "@/bs/icon-button.js";
import { Tabs } from "@/bs/tabs.js";
import { ScrollView } from "@/vendor/ui/components/scroll-view.js";
import { showToast } from "@/lib/toast.js";
import { selectionFromLines, useFile } from "@/context/file.js";
import { useSDK } from "@/context/sdk.js";
import { useLayout } from "@/context/layout.js";
import { useComments } from "@/context/comments.js";
import { useLanguage } from "@/context/language.js";
import { usePrompt } from "@/context/prompt.js";
import { getSessionHandoff } from "@/pages/session/handoff.js";
import { useSessionLayout } from "@/pages/session/session-layout.js";
import { createSessionTabs } from "@/pages/session/helpers.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
// Static markup only — translated/user strings are assigned via textContent.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}
function FileCommentMenu(props) {
  const root = template(`<div></div>`);
  // Keep menu clicks from reaching the annotation/selection handlers around it
  // (the compiled version used delegated $$click/$$mousedown stopPropagation).
  root.addEventListener("click", event => event.stopPropagation());
  root.addEventListener("mousedown", event => event.stopPropagation());
  // DropdownMenu (bs) returns a concrete element; append it directly.
  root.appendChild(createComponent(DropdownMenu, {
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
          return props.moreLabel;
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
                      return props.editLabel;
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
                      return props.deleteLabel;
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
function createScrollSync(input) {
  let scroll;
  let scrollFrame;
  let restoreFrame;
  let pending;
  const [code, setCode] = createSignal([]);
  const getCode = () => {
    const el = scroll;
    if (!el) return [];
    const host = el.querySelector("diffs-container");
    if (!(host instanceof HTMLElement)) return [];
    const root = host.shadowRoot;
    if (!root) return [];
    return Array.from(root.querySelectorAll("[data-code]")).filter(node => node instanceof HTMLElement && node.clientWidth > 0);
  };
  const save = next => {
    pending = next;
    if (scrollFrame !== undefined) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined;
      const out = pending;
      pending = undefined;
      if (!out) return;
      input.view().setScroll(input.tab(), out);
    });
  };
  const onCodeScroll = event => {
    const el = scroll;
    if (!el) return;
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    save({
      x: target.scrollLeft,
      y: el.scrollTop
    });
  };
  const sync = () => {
    const next = getCode();
    const current = code();
    if (next.length === current.length && next.every((el, i) => el === current[i])) return;
    setCode(next);
  };
  const restore = () => {
    const el = scroll;
    if (!el) return;
    const pos = input.view().scroll(input.tab());
    if (!pos) return;
    sync();
    if (code().length > 0) {
      for (const item of code()) {
        if (item.scrollLeft !== pos.x) item.scrollLeft = pos.x;
      }
    }
    if (el.scrollTop !== pos.y) el.scrollTop = pos.y;
    if (code().length > 0) return;
    if (el.scrollLeft !== pos.x) el.scrollLeft = pos.x;
  };
  const queueRestore = () => {
    if (restoreFrame !== undefined) return;
    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = undefined;
      restore();
    });
  };
  const handleScroll = event => {
    if (code().length === 0) sync();
    save({
      x: code()[0]?.scrollLeft ?? event.currentTarget.scrollLeft,
      y: event.currentTarget.scrollTop
    });
  };
  createEffect(() => {
    for (const item of code()) makeEventListener(item, "scroll", onCodeScroll);
  });
  const setViewport = el => {
    scroll = el;
    restore();
  };
  onCleanup(() => {
    if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
    if (restoreFrame !== undefined) cancelAnimationFrame(restoreFrame);
  });
  return {
    handleScroll,
    queueRestore,
    setViewport
  };
}
export function FileTabContent(props) {
  const file = useFile();
  const comments = useComments();
  const language = useLanguage();
  const prompt = usePrompt();
  const fileComponent = useFileComponent();
  const {
    sessionKey,
    tabs,
    view
  } = useSessionLayout();
  const activeFileTab = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab: tab => tab.startsWith("file://") ? file.tab(tab) : tab
  }).activeFileTab;
  let find = null;
  const search = {
    register: handle => {
      find = handle;
    }
  };
  const path = createMemo(() => file.pathFromTab(props.tab));
  const state = createMemo(() => {
    const p = path();
    if (!p) return;
    return file.get(p);
  });
  const contents = createMemo(() => state()?.content?.content ?? "");
  const cacheKey = createMemo(() => sampledChecksum(contents()));
  const sdk = useSDK();
  // Files open in edit mode by default.
  const [editMode, setEditMode] = createSignal(true);
  // Publish view/edit state to the shared layout context so the global toolbar
  // can render a mode-aware toggle + save button. Only one file editor is
  // mounted at a time.
  const layout = useLayout();
  let editorHost;
  // Reach the active CodeMirror instance mounted by VanillaIDE so the toolbar's
  // undo/redo can drive the editor (document.execCommand doesn't reach it).
  const activeCM = () => editorHost?.querySelector(".CodeMirror")?.CodeMirror ?? null;
  layout.editor.bindToggle(() => setEditMode(v => !v));
  layout.editor.bindUndo(() => activeCM()?.undo());
  layout.editor.bindRedo(() => activeCM()?.redo());
  layout.editor.bindSave(() => {
    if (typeof window !== "undefined" && window.VanillaIDE && editorHost) window.VanillaIDE.save(editorHost);
  });
  // Clipboard helpers — prefer the Electron clipboard (always available in the
  // focused window); fall back to the async navigator API.
  const writeClip = async text => {
    try {
      if (window.api?.clipboardWriteText) return void (await window.api.clipboardWriteText(text));
    } catch {}
    try {
      await navigator.clipboard?.writeText(text);
    } catch {}
  };
  const readClip = async () => {
    try {
      if (window.api?.clipboardReadText) return await window.api.clipboardReadText();
    } catch {}
    try {
      return await navigator.clipboard?.readText();
    } catch {}
    return "";
  };
  // Cut/copy/paste act on the CodeMirror instance directly so they keep working
  // even though clicking a toolbar button moves focus off the editor (which is
  // why document.execCommand never reached it).
  layout.editor.bindCut(() => {
    const cm = activeCM();
    if (!cm || !cm.somethingSelected()) return;
    void writeClip(cm.getSelection());
    cm.replaceSelection("");
    cm.focus();
  });
  layout.editor.bindCopy(() => {
    const cm = activeCM();
    if (!cm || !cm.somethingSelected()) return;
    void writeClip(cm.getSelection());
  });
  layout.editor.bindPaste(async () => {
    const cm = activeCM();
    if (!cm) return;
    const text = await readClip();
    if (text) cm.replaceSelection(text);
    cm.focus();
  });
  // Mirror the editor's unsaved (dirty) state to the toolbar save button.
  makeEventListener(window, "vide:dirty", e => {
    if (e.detail?.path === path()) layout.editor.setDirty(!!e.detail.dirty);
  });
  // Mirror the editor's status (cursor / chars / EOL / encoding) to the status bar.
  makeEventListener(window, "vide:editorstate", e => {
    if (e.detail?.path === path()) layout.editor.setInfo(e.detail);
  });
  createEffect(() => layout.editor.set({
    canEdit: true,
    editing: editMode()
  }));
  onCleanup(() => {
    layout.editor.set({
      canEdit: false,
      editing: false,
      dirty: false
    });
    layout.editor.bindToggle(null);
    layout.editor.bindUndo(null);
    layout.editor.bindRedo(null);
    layout.editor.bindSave(null);
    layout.editor.bindCut(null);
    layout.editor.bindCopy(null);
    layout.editor.bindPaste(null);
  });
  const absolutePath = createMemo(() => {
    const rel = path();
    if (!rel) return null;
    const root = (sdk.directory || "").replace(/[\\/]+$/, "");
    if (!root) return null;
    return root + "/" + rel;
  });
  let editorRetry = 0;
  let editorRetryTimer;
  const syncEditor = () => {
    if (typeof window === "undefined" || !editorHost) return;
    if (editorRetryTimer) {
      clearTimeout(editorRetryTimer);
      editorRetryTimer = undefined;
    }
    const ap = absolutePath();
    if (!editMode() || !ap) {
      if (window.VanillaIDE) window.VanillaIDE.unmount(editorHost);
      return;
    }
    // Never leave the tab a silently-blank host when the editor runtime isn't
    // ready: the classic ./vanilla-ide.js normally loads before this module, so
    // this only guards a momentary startup race — show a status and retry, then
    // surface an error rather than returning with an empty host.
    if (!window.VanillaIDE) {
      if (editorRetry < 40) {
        editorHost.textContent = "エディタを読み込み中…";
        editorRetry++;
        editorRetryTimer = setTimeout(syncEditor, 50);
      } else {
        editorHost.textContent = "エディタの読み込みに失敗しました (CodeMirror)。";
      }
      return;
    }
    editorRetry = 0;
    window.VanillaIDE.mount(editorHost, {
      absPath: ap,
      relName: path(),
      onExit: () => setEditMode(false)
    });
  };
  createEffect(() => {
    editMode();
    absolutePath();
    syncEditor();
  });
  // Refresh the editor whenever THIS tab becomes the active one. Tab panes are
  // hidden with display:none; a CodeMirror created/measured while its pane was
  // hidden renders a single line (blank), and neither ResizeObserver nor
  // IntersectionObserver fires reliably for an ancestor display:none -> visible
  // toggle. So when the tab is switched to, explicitly refresh once layout has
  // settled (a few staggered ticks cover any layout timing; refresh is cheap and
  // idempotent). setTimeout, never requestAnimationFrame (rAF is paused while the
  // window is occluded).
  createEffect(() => {
    if (activeFileTab() !== props.tab) return;
    for (const delay of [0, 60, 200]) {
      setTimeout(() => {
        if (editorHost && typeof window !== "undefined" && window.VanillaIDE) {
          try { window.VanillaIDE.refresh(editorHost); } catch {}
        }
      }, delay);
    }
  });
  onCleanup(() => {
    if (editorRetryTimer) clearTimeout(editorRetryTimer);
    if (editorHost && typeof window !== "undefined" && window.VanillaIDE) window.VanillaIDE.unmount(editorHost);
  });
  const selectedLines = createMemo(() => {
    const p = path();
    if (!p) return null;
    if (file.ready()) return file.selectedLines(p) ?? null;
    return getSessionHandoff(sessionKey())?.files[p] ?? null;
  });
  const scrollSync = createScrollSync({
    tab: () => props.tab,
    view
  });
  const selectionPreview = (source, selection) => {
    return previewSelectedLines(source, {
      start: selection.startLine,
      end: selection.endLine
    });
  };
  const buildPreview = (filePath, selection) => {
    const source = filePath === path() ? contents() : file.get(filePath)?.content?.content;
    if (!source) return undefined;
    return selectionPreview(source, selection);
  };
  const addCommentToContext = input => {
    const selection = selectionFromLines(input.selection);
    const preview = input.preview ?? buildPreview(input.file, selection);
    const saved = comments.add({
      file: input.file,
      selection: input.selection,
      comment: input.comment
    });
    prompt.context.add({
      type: "file",
      path: input.file,
      selection,
      comment: input.comment,
      commentID: saved.id,
      commentOrigin: input.origin,
      preview
    });
  };
  const updateCommentInContext = input => {
    comments.update(input.file, input.id, input.comment);
    const preview = input.file === path() ? buildPreview(input.file, selectionFromLines(input.selection)) : undefined;
    prompt.context.updateComment(input.file, input.id, {
      comment: input.comment,
      ...(preview ? {
        preview
      } : {})
    });
  };
  const removeCommentFromContext = input => {
    comments.remove(input.file, input.id);
    prompt.context.removeComment(input.file, input.id);
  };
  const fileComments = createMemo(() => {
    const p = path();
    if (!p) return [];
    return comments.list(p);
  });
  const commentedLines = createMemo(() => fileComments().map(comment => comment.selection));
  const [note, setNote] = createStore({
    openedComment: null,
    commenting: null,
    selected: null
  });
  const syncSelected = range => {
    const p = path();
    if (!p) return;
    file.setSelectedLines(p, range ? cloneSelectedLineRange(range) : null);
  };
  const activeSelection = () => note.selected ?? selectedLines();
  const commentsUi = createLineCommentController({
    comments: fileComments,
    label: language.t("ui.lineComment.submit"),
    draftKey: () => path() ?? props.tab,
    mention: {
      items: file.searchFilesAndDirectories
    },
    state: {
      opened: () => note.openedComment,
      setOpened: id => setNote("openedComment", id),
      selected: () => note.selected,
      setSelected: range => setNote("selected", range),
      commenting: () => note.commenting,
      setCommenting: range => setNote("commenting", range),
      syncSelected,
      hoverSelected: syncSelected
    },
    getHoverSelectedRange: activeSelection,
    cancelDraftOnCommentToggle: true,
    clearSelectionOnSelectionEndNull: true,
    onSubmit: ({
      comment,
      selection
    }) => {
      const p = path();
      if (!p) return;
      addCommentToContext({
        file: p,
        selection,
        comment,
        origin: "file"
      });
    },
    onUpdate: ({
      id,
      comment,
      selection
    }) => {
      const p = path();
      if (!p) return;
      updateCommentInContext({
        id,
        file: p,
        selection,
        comment
      });
    },
    onDelete: comment => {
      const p = path();
      if (!p) return;
      removeCommentFromContext({
        id: comment.id,
        file: p
      });
    },
    editSubmitLabel: language.t("common.save"),
    renderCommentActions: (_, controls) => createComponent(FileCommentMenu, {
      get moreLabel() {
        return language.t("common.moreOptions");
      },
      get editLabel() {
        return language.t("common.edit");
      },
      get deleteLabel() {
        return language.t("common.delete");
      },
      get onEdit() {
        return controls.edit;
      },
      get onDelete() {
        return controls.remove;
      }
    })
  });
  // Floating "reply" button shown on a text selection (replaces the per-line
  // "+"): clicking it opens the comment draft for the selected range, which is
  // added to the chat context.
  const [replyBtn, setReplyBtn] = createStore({
    open: false,
    top: 0,
    left: 0,
    range: null
  });
  const hideReply = () => setReplyBtn({ open: false, range: null });
  const showReplyAtSelection = range => {
    if (!range) return hideReply();
    let rect = null;
    try {
      const sel = typeof window !== "undefined" ? window.getSelection() : null;
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) rect = sel.getRangeAt(0).getBoundingClientRect();
    } catch {}
    if (!rect || rect.width === 0 && rect.height === 0) return hideReply();
    setReplyBtn({
      open: true,
      range: cloneSelectedLineRange(range),
      top: Math.max(4, rect.top - 30),
      left: rect.right + 6
    });
  };
  createEffect(() => {
    if (typeof window === "undefined") return;
    const onKeyDown = event => {
      if (activeFileTab() !== props.tab) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      event.stopPropagation();
      find?.focus();
    };
    makeEventListener(window, "keydown", onKeyDown, {
      capture: true
    });
  });
  createEffect(on(path, () => {
    commentsUi.note.reset();
  }, {
    defer: true
  }));
  createEffect(() => {
    const focus = comments.focus();
    const p = path();
    if (!focus || !p) return;
    if (focus.file !== p) return;
    if (activeFileTab() !== props.tab) return;
    const target = fileComments().find(comment => comment.id === focus.id);
    if (!target) return;
    commentsUi.note.openComment(target.id, target.selection, {
      cancelDraft: true
    });
    requestAnimationFrame(() => comments.clearFocus());
  });
  let prev = {
    loaded: false,
    ready: false,
    active: false
  };
  createEffect(() => {
    const loaded = !!state()?.loaded;
    const ready = file.ready();
    const active = activeFileTab() === props.tab;
    const restore = loaded && !prev.loaded || ready && !prev.ready || active && loaded && !prev.active;
    prev = {
      loaded,
      ready,
      active
    };
    if (!restore) return;
    scrollSync.queueRestore();
  });
  const renderFile = source => {
    const el = template(`<div class="relative overflow-hidden pb-40"></div>`);
    // fileComponent is the context-provided file component. The provider
    // snapshots props.component once (createSimpleContext init), so the
    // component is static and Dynamic is unnecessary: create it directly and
    // let insert() reconcile the result as the sole content of the wrapper.
    insert(el, createComponent(fileComponent, {
      mode: "text",
      get file() {
        return {
          name: path() ?? "",
          contents: source,
          cacheKey: cacheKey()
        };
      },
      enableLineSelection: true,
      enableHoverUtility: false,
      get selectedLines() {
        return activeSelection();
      },
      get commentedLines() {
        return commentedLines();
      },
      onRendered: () => {
        scrollSync.queueRestore();
      },
      get annotations() {
        return commentsUi.annotations();
      },
      get renderAnnotation() {
        return commentsUi.renderAnnotation;
      },
      // No per-line hover "+": the reply button on a text selection replaces it.
      renderHoverUtility: undefined,
      onLineSelected: range => {
        commentsUi.onLineSelected(range);
        if (!range) hideReply();
      },
      get onLineNumberSelectionEnd() {
        return commentsUi.onLineNumberSelectionEnd;
      },
      onLineSelectionEnd: range => {
        commentsUi.onLineSelectionEnd(range);
        showReplyAtSelection(range);
      },
      search: search,
      "class": "select-text",
      get media() {
        return {
          mode: "auto",
          path: path(),
          current: state()?.content,
          onLoad: scrollSync.queueRestore,
          onError: args => {
            if (args.kind !== "svg") return;
            showToast({
              variant: "error",
              title: language.t("toast.file.loadFailed.title")
            });
          }
        };
      }
    }));
    return el;
  };
  // Floating reply button (Show when replyBtn.open). Show re-runs the children
  // getter on every open, rebuilding the button exactly like the compiled
  // branch did (its position effect is owned by the branch and disposed with it).
  const replyShow = createComponent(Show, {
    get when() {
      return replyBtn.open;
    },
    get children() {
      const btn = template(`<button type="button" class="btn btn-primary btn-sm position-fixed shadow d-flex align-items-center gap-1" style="z-index:2060;padding:2px 8px" title="この選択について返信" aria-label="この選択について返信"><i class="bi bi-reply"></i></button>`);
      // Keep the text selection alive through the click (mousedown would
      // otherwise collapse it and unmount this button before click fires).
      btn.addEventListener("mousedown", e => e.preventDefault());
      btn.addEventListener("click", () => {
        if (replyBtn.range) commentsUi.note.openDraft(replyBtn.range);
        hideReply();
      });
      createEffect(() => {
        btn.style.top = replyBtn.top + "px";
        btn.style.left = replyBtn.left + "px";
      });
      return btn;
    }
  });
  // Edit/view switch. Show re-evaluates children/fallback per flip, so the
  // editor host and the scroll view remount (state reset) exactly as before.
  const editorShow = createComponent(Show, {
    get when() {
      return editMode();
    },
    get children() {
      const host = template(`<div class="h-full"></div>`);
      editorHost = host;
      // Mount now and again on a macrotask. NOT requestAnimationFrame: rAF is
      // paused while the window is occluded/hidden, so a rAF-gated mount never
      // fires on a cold first paint and the tab is left with an empty host (no
      // editor DOM at all — VanillaIDE.mount() was never reached). syncEditor()
      // is idempotent (mount() calls unmount() first), so the immediate call
      // mounts ASAP and the timeout re-syncs once the host is attached.
      syncEditor();
      setTimeout(syncEditor, 0);
      return host;
    },
    get fallback() {
      return createComponent(ScrollView, {
        "class": "h-full",
        get viewportRef() {
          return scrollSync.setViewport;
        },
        get onScroll() {
          return scrollSync.handleScroll;
        },
        get children() {
          return createComponent(Switch, {
            get children() {
              return [createComponent(Match, {
                get when() {
                  return state()?.loaded;
                },
                get children() {
                  return renderFile(contents());
                }
              }), createComponent(Match, {
                get when() {
                  return state()?.loading;
                },
                get children() {
                  const el = template(`<div class="px-6 py-4 text-secondary">...</div>`);
                  // Localized label precedes the static "..." text node and
                  // stays live across language switches.
                  const label = document.createTextNode("");
                  el.insertBefore(label, el.firstChild);
                  createRenderEffect(() => {
                    label.textContent = language.t("common.loading");
                  });
                  return el;
                }
              }), createComponent(Match, {
                get when() {
                  return state()?.error;
                },
                children: err => {
                  const el = template(`<div class="px-6 py-4 text-secondary"></div>`);
                  // err is a live accessor (non-keyed Match function child);
                  // insert() tracks it as the sole content of this div.
                  insert(el, err);
                  return el;
                }
              })];
            }
          });
        }
      });
    }
  });
  const content = createComponent(Tabs.Content, {
    get value() {
      return props.tab;
    },
    "class": "mt-3 relative h-full"
  });
  // Append the two Show branches with explicit null markers so each insert
  // reconciles only its own nodes (a marker-less insert would clear the whole
  // pane when the fallback-less reply Show turns off). Order matches the
  // original children array: [reply button, editor/view].
  insert(content, replyShow, null);
  insert(content, editorShow, null);
  return content;
}