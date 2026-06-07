import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="relative overflow-hidden pb-40">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="px-6 py-4 text-secondary">...`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div class="px-6 py-4 text-secondary">`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div class="h-full">`),
  _tmplReply = /*#__PURE__*/_$template(`<button type=button class="btn btn-primary btn-sm position-fixed shadow d-flex align-items-center gap-1" style="z-index:2060;padding:2px 8px" title="この選択について返信" aria-label="この選択について返信"><i class="bi bi-reply"></i></button>`);
import { createEffect, createMemo, createSignal, Match, on, onCleanup, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { Dynamic } from "solid-js/web";
import { makeEventListener } from "@solid-primitives/event-listener";
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
function FileCommentMenu(props) {
  return (() => {
    var _el$ = _tmpl$();
    _el$.$$click = event => event.stopPropagation();
    _el$.$$mousedown = event => event.stopPropagation();
    _$insert(_el$, _$createComponent(DropdownMenu, {
      gutter: 4,
      placement: "bottom-end",
      get children() {
        return [_$createComponent(DropdownMenu.Trigger, {
          as: IconButton,
          icon: "dot-grid",
          variant: "ghost",
          size: "small",
          "class": "size-6 rounded-2",
          get ["aria-label"]() {
            return props.moreLabel;
          }
        }), _$createComponent(DropdownMenu.Portal, {
          get children() {
            return _$createComponent(DropdownMenu.Content, {
              get children() {
                return [_$createComponent(DropdownMenu.Item, {
                  get onSelect() {
                    return props.onEdit;
                  },
                  get children() {
                    return _$createComponent(DropdownMenu.ItemLabel, {
                      get children() {
                        return props.editLabel;
                      }
                    });
                  }
                }), _$createComponent(DropdownMenu.Item, {
                  get onSelect() {
                    return props.onDelete;
                  },
                  get children() {
                    return _$createComponent(DropdownMenu.ItemLabel, {
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
    return _el$;
  })();
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
  const syncEditor = () => {
    if (typeof window === "undefined" || !window.VanillaIDE || !editorHost) return;
    const ap = absolutePath();
    if (editMode() && ap) {
      window.VanillaIDE.mount(editorHost, {
        absPath: ap,
        relName: path(),
        onExit: () => setEditMode(false)
      });
    } else {
      window.VanillaIDE.unmount(editorHost);
    }
  };
  createEffect(() => {
    editMode();
    absolutePath();
    syncEditor();
  });
  onCleanup(() => {
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
    renderCommentActions: (_, controls) => _$createComponent(FileCommentMenu, {
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
  const renderFile = source => (() => {
    var _el$2 = _tmpl$2();
    _$insert(_el$2, _$createComponent(Dynamic, {
      component: fileComponent,
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
    return _el$2;
  })();
  return _$createComponent(Tabs.Content, {
    get value() {
      return props.tab;
    },
    "class": "mt-3 relative h-full",
    get children() {
      return [_$createComponent(Show, {
        get when() {
          return replyBtn.open;
        },
        get children() {
          var _b = _tmplReply();
          // Keep the text selection alive through the click (mousedown would
          // otherwise collapse it and unmount this button before click fires).
          _b.addEventListener("mousedown", e => e.preventDefault());
          _b.addEventListener("click", () => {
            if (replyBtn.range) commentsUi.note.openDraft(replyBtn.range);
            hideReply();
          });
          createEffect(() => {
            _b.style.top = replyBtn.top + "px";
            _b.style.left = replyBtn.left + "px";
          });
          return _b;
        }
      }), _$createComponent(Show, {
        get when() {
          return editMode();
        },
        get children() {
          var _host = _tmpl$5();
          editorHost = _host;
          requestAnimationFrame(syncEditor);
          return _host;
        },
        get fallback() {
          return _$createComponent(ScrollView, {
        "class": "h-full",
        get viewportRef() {
          return scrollSync.setViewport;
        },
        get onScroll() {
          return scrollSync.handleScroll;
        },
        get children() {
          return _$createComponent(Switch, {
            get children() {
              return [_$createComponent(Match, {
                get when() {
                  return state()?.loaded;
                },
                get children() {
                  return renderFile(contents());
                }
              }), _$createComponent(Match, {
                get when() {
                  return state()?.loading;
                },
                get children() {
                  var _el$3 = _tmpl$3(),
                    _el$4 = _el$3.firstChild;
                  _$insert(_el$3, () => language.t("common.loading"), _el$4);
                  return _el$3;
                }
              }), _$createComponent(Match, {
                get when() {
                  return state()?.error;
                },
                children: err => (() => {
                  var _el$5 = _tmpl$4();
                  _$insert(_el$5, err);
                  return _el$5;
                })()
              })];
            }
          });
        }
          });
        }
      })];
    }
  });
}
_$delegateEvents(["mousedown", "click"]);