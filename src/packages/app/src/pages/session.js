// insert() from solid-js/web is the established exception for reactive and
// component-valued children (runtime Show/For/Switch return memo accessors),
// so Solid keeps reconciling accessors instead of freezing them.
import { insert as _solidInsert } from "solid-js/web";
import { useDialog } from "@/lib/dialog.js";
import { createQuery, skipToken } from "@/lib/query/index.js";
import { onCleanup, Show, Match, Switch, For, createComponent, createMemo, createEffect, createComputed, createRenderEffect, on, onMount, untrack, createResource } from "solid-js";
import { makeEventListener } from "@/lib/primitives/event-listener.js";
import { createMediaQuery } from "@/lib/primitives/media.js";
import { createResizeObserver } from "@/lib/primitives/resize-observer.js";
import { useLocal } from "@/context/local.js";
import { selectionFromLines, useFile } from "@/context/file.js";
import { createStore } from "solid-js/store";
import { ResizeHandle } from "@/vendor/ui/components/resize-handle.js";
import { Select } from "@/bs/select.js";
import { Tabs } from "@/bs/tabs.js";
import { createAutoScroll } from "@/lib/hooks.js";
import { previewSelectedLines } from "@/vendor/ui/pierre/selection-bridge.js";
import { Button } from "@/bs/button.js";
import { checksum } from "core/util/encode";
import { useSearchParams, useNavigate } from "@/lib/router/index.js";
import { base64Encode } from "core/util/encode";
import { sortedRootSessions } from "@/pages/layout/helpers.js";
import { SessionTabBar } from "@/pages/session/session-tab-bar.js";
import { showFileContextMenu } from "@/pages/session/file-context-menu.js";
import { NewSessionView, SessionHeader, SortableTab, FileVisual } from "@/components/session/index.js";
import { useComments } from "@/context/comments.js";
import { getSessionPrefetch, SESSION_PREFETCH_TTL } from "@/context/global-sync/session-prefetch.js";
import { useGlobalSync } from "@/context/global-sync.js";
import { useLanguage } from "@/context/language.js";
import { useLayout } from "@/context/layout.js";
import { usePrompt } from "@/context/prompt.js";
import { useSDK } from "@/context/sdk.js";
import { useSettings } from "@/context/settings.js";
import { useSync } from "@/context/sync.js";
import { useTerminal } from "@/context/terminal.js";
import { useSessionController } from "@/controllers/session.js";
import { createSessionComposerState, SessionComposerRegion } from "@/pages/session/composer/index.js";
import { createOpenReviewFile, createOpenSessionFileTab, createSessionTabs, createSizing, focusTerminalById, getTabReorderIndex, shouldFocusTerminalOnKeyDown } from "@/pages/session/helpers.js";
import { MessageTimeline } from "@/pages/session/message-timeline.js";
import { SessionReviewTab } from "@/pages/session/review-tab.js";
import { useSessionLayout } from "@/pages/session/session-layout.js";
import { syncSessionModel } from "@/pages/session/session-model-helpers.js";
import { SessionSidePanel } from "@/pages/session/session-side-panel.js";
import { FileTabContent } from "@/pages/session/file-tabs.js";
import { FileTreePane } from "@/pages/session/file-tree-pane.js";
import { TerminalPanel } from "@/pages/session/terminal-panel.js";
import { useSessionCommands } from "@/pages/session/use-session-commands.js";
import { useSessionHashScroll } from "@/pages/session/use-session-hash-scroll.js";
import { diffs as list } from "@/utils/diffs.js";
import { Persist, persisted } from "@/utils/persist.js";
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd";
import { ConstrainDragYAxis, getDraggableId } from "@/utils/solid-dnd.js";
import { createFileTabListSync } from "@/pages/session/file-tab-scroll.js";
import { useCommand } from "@/context/command.js";
import { IconButton } from "@/bs/icon-button.js";
import { TooltipKeybind } from "@/bs/tooltip.js";
import { extractPromptFromParts } from "@/utils/prompt.js";
import { same } from "@/utils/same.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates). Built fresh per call: no cloneNode.
// Static markup only — translated/user strings are assigned via textContent.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}
const emptyUserMessages = [];
const emptyFollowups = [];
/**
 * Maintains the rendered history window for a session timeline.
 *
 * It keeps initial paint bounded to recent turns, reveals cached turns in
 * small batches while scrolling upward, and prefetches older history near top.
 */
function createSessionHistoryWindow(input) {
  const turnInit = 10;
  const turnBatch = 8;
  const turnScrollThreshold = 200;
  const turnPrefetchBuffer = 16;
  const prefetchCooldownMs = 400;
  const prefetchNoGrowthLimit = 2;
  const [state, setState] = createStore({
    turnID: undefined,
    turnStart: 0,
    prefetchUntil: 0,
    prefetchNoGrowth: 0
  });
  const initialTurnStart = len => len > turnInit ? len - turnInit : 0;
  const turnStart = createMemo(() => {
    const id = input.sessionID();
    const len = input.visibleUserMessages().length;
    if (!id || len <= 0) return 0;
    if (state.turnID !== id) return initialTurnStart(len);
    if (state.turnStart <= 0) return 0;
    if (state.turnStart >= len) return initialTurnStart(len);
    return state.turnStart;
  });
  const setTurnStart = start => {
    const id = input.sessionID();
    const next = start > 0 ? start : 0;
    if (!id) {
      setState({
        turnID: undefined,
        turnStart: next
      });
      return;
    }
    setState({
      turnID: id,
      turnStart: next
    });
  };
  const renderedUserMessages = createMemo(() => {
    const msgs = input.visibleUserMessages();
    const start = turnStart();
    if (start <= 0) return msgs;
    return msgs.slice(start);
  }, emptyUserMessages, {
    equals: same
  });
  const preserveScroll = fn => {
    const el = input.scroller();
    if (!el) {
      fn();
      return;
    }
    const beforeTop = el.scrollTop;
    const beforeHeight = el.scrollHeight;
    fn();
    requestAnimationFrame(() => {
      const delta = el.scrollHeight - beforeHeight;
      if (!delta) return;
      el.scrollTop = beforeTop + delta;
    });
  };
  const backfillTurns = () => {
    const start = turnStart();
    if (start <= 0) return;
    const next = start - turnBatch;
    const nextStart = next > 0 ? next : 0;
    preserveScroll(() => setTurnStart(nextStart));
  };

  /** Button path: reveal all cached turns, fetch older history, reveal one batch. */
  const loadAndReveal = async () => {
    const id = input.sessionID();
    if (!id) return;
    const start = turnStart();
    const beforeVisible = input.visibleUserMessages().length;
    let loaded = input.loaded();
    if (start > 0) setTurnStart(0);
    if (!input.historyMore() || input.historyLoading()) return;
    let afterVisible = beforeVisible;
    let added = 0;
    while (true) {
      await input.loadMore(id);
      if (input.sessionID() !== id) return;
      afterVisible = input.visibleUserMessages().length;
      const nextLoaded = input.loaded();
      const raw = nextLoaded - loaded;
      added += raw;
      loaded = nextLoaded;
      if (afterVisible > beforeVisible) break;
      if (raw <= 0) break;
      if (!input.historyMore()) break;
    }
    if (added <= 0) return;
    if (state.prefetchNoGrowth) setState("prefetchNoGrowth", 0);
    const growth = afterVisible - beforeVisible;
    if (growth <= 0) return;
    if (turnStart() !== 0) return;
    const target = Math.min(afterVisible, beforeVisible + turnBatch);
    setTurnStart(Math.max(0, afterVisible - target));
  };

  /** Scroll/prefetch path: fetch older history from server. */
  const fetchOlderMessages = async opts => {
    const id = input.sessionID();
    if (!id) return;
    if (!input.historyMore() || input.historyLoading()) return;
    if (opts?.prefetch) {
      const now = Date.now();
      if (state.prefetchUntil > now) return;
      if (state.prefetchNoGrowth >= prefetchNoGrowthLimit) return;
      setState("prefetchUntil", now + prefetchCooldownMs);
    }
    const start = turnStart();
    const beforeVisible = input.visibleUserMessages().length;
    const beforeRendered = start <= 0 ? beforeVisible : renderedUserMessages().length;
    let loaded = input.loaded();
    let added = 0;
    let growth = 0;
    while (true) {
      await input.loadMore(id);
      if (input.sessionID() !== id) return;
      const nextLoaded = input.loaded();
      const raw = nextLoaded - loaded;
      added += raw;
      loaded = nextLoaded;
      growth = input.visibleUserMessages().length - beforeVisible;
      if (growth > 0) break;
      if (raw <= 0) break;
      if (opts?.prefetch) break;
      if (!input.historyMore()) break;
    }
    const afterVisible = input.visibleUserMessages().length;
    if (opts?.prefetch) {
      setState("prefetchNoGrowth", added > 0 ? 0 : state.prefetchNoGrowth + 1);
    } else if (added > 0 && state.prefetchNoGrowth) {
      setState("prefetchNoGrowth", 0);
    }
    if (added <= 0) return;
    if (growth <= 0) return;
    if (opts?.prefetch) {
      const current = turnStart();
      preserveScroll(() => setTurnStart(current + growth));
      return;
    }
    if (turnStart() !== start) return;
    const currentRendered = renderedUserMessages().length;
    const base = Math.max(beforeRendered, currentRendered);
    const target = Math.min(afterVisible, base + turnBatch);
    preserveScroll(() => setTurnStart(Math.max(0, afterVisible - target)));
  };
  const onScrollerScroll = () => {
    if (!input.userScrolled()) return;
    const el = input.scroller();
    if (!el) return;
    if (el.scrollTop >= turnScrollThreshold) return;
    const start = turnStart();
    if (start > 0) {
      if (start <= turnPrefetchBuffer) {
        void fetchOlderMessages({
          prefetch: true
        });
      }
      backfillTurns();
      return;
    }
    void fetchOlderMessages();
  };
  createEffect(on(input.sessionID, () => {
    setState({
      prefetchUntil: 0,
      prefetchNoGrowth: 0
    });
  }, {
    defer: true
  }));
  createEffect(on(() => [input.sessionID(), input.messagesReady()], ([id, ready]) => {
    if (!id || !ready) return;
    setTurnStart(initialTurnStart(input.visibleUserMessages().length));
  }, {
    defer: true
  }));
  return {
    turnStart,
    setTurnStart,
    renderedUserMessages,
    loadAndReveal,
    onScrollerScroll
  };
}
export default function Page() {
  const globalSync = useGlobalSync();
  const layout = useLayout();
  const local = useLocal();
  const file = useFile();
  const sync = useSync();
  const dialog = useDialog();
  const language = useLanguage();
  const sdk = useSDK();
  const settings = useSettings();
  const prompt = usePrompt();
  const comments = useComments();
  const terminal = useTerminal();
  const command = useCommand();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    params,
    sessionKey,
    tabs,
    view
  } = useSessionLayout();
  const navigate = useNavigate();
  // Session-switching tab bar: list the current directory's root sessions.
  const sessionTabChildStore = createMemo(() => {
    const dir = sdk.directory;
    return dir ? globalSync.child(dir, { bootstrap: false })[0] : null;
  });
  const sessionTabList = createMemo(() => {
    const childStore = sessionTabChildStore();
    return childStore ? sortedRootSessions(childStore, Date.now()) : [];
  });
  createEffect(() => {
    if (!prompt.ready()) return;
    untrack(() => {
      if (params.id) return;
      const text = searchParams.prompt;
      if (!text) return;
      prompt.set([{
        type: "text",
        content: text,
        start: 0,
        end: text.length
      }], text.length);
      setSearchParams({
        ...searchParams,
        prompt: undefined
      });
    });
  });
  const [ui, setUi] = createStore({
    pendingMessage: undefined,
    reviewSnap: false,
    scrollGesture: 0,
    scroll: {
      overflow: false,
      bottom: true,
      jump: false
    }
  });
  const composer = createSessionComposerState();
  const workspaceKey = createMemo(() => params.dir ?? "");
  const workspaceTabs = createMemo(() => layout.tabs(workspaceKey));
  createEffect(on(() => params.id, (id, prev) => {
    if (!id) return;
    if (prev) return;
    const pending = layout.handoff.tabs();
    if (!pending) return;
    if (Date.now() - pending.at > 60_000) {
      layout.handoff.clearTabs();
      return;
    }
    if (pending.id !== id) return;
    layout.handoff.clearTabs();
    if (pending.dir !== (params.dir ?? "")) return;
    const from = workspaceTabs().tabs();
    if (from.all.length === 0 && !from.active) return;
    const current = tabs().tabs();
    if (current.all.length > 0 || current.active) return;
    const all = normalizeTabs(from.all);
    const active = from.active ? normalizeTab(from.active) : undefined;
    tabs().setAll(all);
    tabs().setActive(active && all.includes(active) ? active : all[0]);
    workspaceTabs().setAll([]);
    workspaceTabs().setActive(undefined);
  }, {
    defer: true
  }));
  const isDesktop = createMediaQuery("(min-width: 768px)");
  const size = createSizing();
  const desktopReviewOpen = createMemo(() => isDesktop() && view().reviewPanel.opened());
  const desktopFileTreeOpen = createMemo(() => isDesktop() && layout.fileTree.opened());
  const sessionPanelWidth = createMemo(() => {
    // Center editor always flexes to fill the row; the RIGHT review panel
    // carries the fixed width (layout.session.width) instead. So the center
    // never sets an explicit width.
    return "";
  });
  const centered = createMemo(() => isDesktop() && !desktopReviewOpen());
  function normalizeTab(tab) {
    if (!tab.startsWith("file://")) return tab;
    return file.tab(tab);
  }
  function normalizeTabs(list) {
    const seen = new Set();
    const next = [];
    for (const item of list) {
      const value = normalizeTab(item);
      if (seen.has(value)) continue;
      seen.add(value);
      next.push(value);
    }
    return next;
  }
  const openReviewPanel = () => {
    if (!view().reviewPanel.opened()) view().reviewPanel.open();
  };
  const info = createMemo(() => params.id ? sync.session.get(params.id) : undefined);
  const isChildSession = createMemo(() => !!info()?.parentID);
  const diffs = createMemo(() => params.id ? list(sync.data?.session_diff?.[params.id]) : []);
  const canReview = createMemo(() => !!sync.project);
  const reviewTab = createMemo(() => isDesktop());
  const tabState = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab,
    review: reviewTab,
    hasReview: canReview
  });
  const activeTab = tabState.activeTab;
  const activeFileTab = tabState.activeFileTab;
  const openedTabs = tabState.openedTabs;
  const contextOpen = tabState.contextOpen;
  const revertMessageID = createMemo(() => info()?.revert?.messageID);
  const messages = createMemo(() => params.id ? sync.data?.message?.[params.id] ?? [] : []);
  const messagesReady = createMemo(() => {
    const id = params.id;
    if (!id) return true;
    return sync.data?.message?.[id] !== undefined;
  });
  const historyMore = createMemo(() => {
    const id = params.id;
    if (!id) return false;
    return sync.session.history.more(id);
  });
  const historyLoading = createMemo(() => {
    const id = params.id;
    if (!id) return false;
    return sync.session.history.loading(id);
  });
  const userMessages = createMemo(() => messages().filter(m => m.role === "user"), emptyUserMessages, {
    equals: same
  });
  const visibleUserMessages = createMemo(() => {
    const revert = revertMessageID();
    if (!revert) return userMessages();
    return userMessages().filter(m => m.id < revert);
  }, emptyUserMessages, {
    equals: same
  });
  const lastUserMessage = createMemo(() => visibleUserMessages().at(-1));
  createEffect(() => {
    const tab = activeFileTab();
    if (!tab) return;
    const path = file.pathFromTab(tab);
    if (path) void file.load(path);
  });
  createEffect(on(() => lastUserMessage()?.id, () => {
    const msg = lastUserMessage();
    if (!msg) return;
    syncSessionModel(local, msg);
  }));
  createEffect(on(() => ({
    dir: params.dir,
    id: params.id
  }), (next, prev) => {
    if (!prev) return;
    if (next.dir === prev.dir && next.id === prev.id) return;
    if (prev.id && !next.id) local.session.reset();
  }, {
    defer: true
  }));
  const [store, setStore] = createStore({
    messageId: undefined,
    mobileTab: "session",
    changes: "git",
    newSessionWorktree: "main",
    deferRender: false
  });
  const [followup, setFollowup] = persisted(Persist.workspace(sdk.directory, "followup", ["followup.v1"]), createStore({
    items: {},
    failed: {},
    paused: {},
    edit: {}
  }));
  const controller = useSessionController({
    followupStore: () => followup,
    setFollowup,
    composerBlocked: () => composer.blocked(),
    isChildSession: () => isChildSession(),
    resumeScroll: () => resumeScroll()
  });
  createComputed(prev => {
    const key = sessionKey();
    if (key !== prev) {
      setStore("deferRender", true);
      requestAnimationFrame(() => {
        setTimeout(() => setStore("deferRender", false), 0);
      });
    }
    return key;
  }, sessionKey());
  let reviewFrame;
  let refreshFrame;
  let refreshTimer;
  let todoFrame;
  let todoTimer;
  let diffFrame;
  let diffTimer;
  createComputed(prev => {
    const open = desktopReviewOpen();
    if (prev === undefined || prev === open) return open;
    if (reviewFrame !== undefined) cancelAnimationFrame(reviewFrame);
    setUi("reviewSnap", true);
    reviewFrame = requestAnimationFrame(() => {
      reviewFrame = undefined;
      setUi("reviewSnap", false);
    });
    return open;
  }, desktopReviewOpen());
  const turnDiffs = createMemo(() => list(lastUserMessage()?.summary?.diffs));
  const nogit = createMemo(() => !!sync.project && sync.project.vcs !== "git");
  const changesOptions = createMemo(() => {
    const list = [];
    if (sync.project?.vcs === "git") list.push("git");
    if (sync.project?.vcs === "git" && sync.data?.vcs?.branch && sync.data?.vcs?.default_branch && sync.data?.vcs.branch !== sync.data?.vcs.default_branch) {
      list.push("branch");
    }
    list.push("turn");
    return list;
  });
  const mobileChanges = createMemo(() => !isDesktop() && store.mobileTab === "changes");
  const wantsReview = createMemo(() => isDesktop() ? desktopFileTreeOpen() || desktopReviewOpen() && activeTab() === "review" : store.mobileTab === "changes");
  const vcsMode = createMemo(() => {
    if (store.changes === "git" || store.changes === "branch") return store.changes;
  });
  const vcsKey = createMemo(() => controller.vcsKey());
  const vcsQuery = createQuery(() => {
    const mode = vcsMode();
    const enabled = wantsReview() && sync.project?.vcs === "git";
    return {
      queryKey: [...vcsKey(), mode],
      enabled,
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: 60 * 1000,
      queryFn: mode ? () => controller.queryVcsDiff(mode) : skipToken
    };
  });
  const refreshVcs = () => controller.refreshVcs();
  onCleanup(() => controller.disposeRefreshVcs());
  const reviewDiffs = () => {
    if (store.changes === "git" || store.changes === "branch")
      // avoids suspense
      return vcsQuery.isFetched ? vcsQuery.data ?? [] : [];
    return turnDiffs();
  };
  const reviewCount = () => reviewDiffs().length;
  const hasReview = () => reviewCount() > 0;
  const reviewReady = () => {
    if (store.changes === "git" || store.changes === "branch") return !vcsQuery.isPending;
    return true;
  };
  const newSessionWorktree = createMemo(() => {
    if (store.newSessionWorktree === "create") return "create";
    const project = sync.project;
    if (project && sdk.directory !== project.worktree) return sdk.directory;
    return "main";
  });
  const setActiveMessage = message => {
    messageMark = scrollMark;
    setStore("messageId", message?.id);
  };
  const anchor = id => `message-${id}`;
  const cursor = () => {
    const root = scroller;
    if (!root) return store.messageId;
    const box = root.getBoundingClientRect();
    const line = box.top + 100;
    const list = [...root.querySelectorAll("[data-message-id]")].map(el => {
      const id = el.dataset.messageId;
      if (!id) return;
      const rect = el.getBoundingClientRect();
      return {
        id,
        top: rect.top,
        bottom: rect.bottom
      };
    }).filter(item => !!item);
    const shown = list.filter(item => item.bottom > box.top && item.top < box.bottom);
    const hit = shown.find(item => item.top <= line && item.bottom >= line);
    if (hit) return hit.id;
    const near = [...shown].sort((a, b) => {
      const da = Math.abs(a.top - line);
      const db = Math.abs(b.top - line);
      if (da !== db) return da - db;
      return a.top - b.top;
    })[0];
    if (near) return near.id;
    return list.filter(item => item.top <= line).at(-1)?.id ?? list[0]?.id ?? store.messageId;
  };
  function navigateMessageByOffset(offset) {
    const msgs = visibleUserMessages();
    if (msgs.length === 0) return;
    const current = store.messageId && messageMark === scrollMark ? store.messageId : cursor();
    const base = current ? msgs.findIndex(m => m.id === current) : msgs.length;
    const currentIndex = base === -1 ? msgs.length : base;
    const targetIndex = currentIndex + offset;
    if (targetIndex < 0 || targetIndex > msgs.length) return;
    if (targetIndex === msgs.length) {
      resumeScroll();
      return;
    }
    autoScroll.pause();
    scrollToMessage(msgs[targetIndex], "auto");
  }
  const initGit = () => controller.initGit();
  let inputRef;
  let promptDock;
  let dockHeight = 0;
  let scroller;
  let content;
  let scrollMark = 0;
  let messageMark = 0;
  const scrollGestureWindowMs = 250;
  const markScrollGesture = target => {
    const root = scroller;
    if (!root) return;
    const el = target instanceof Element ? target : undefined;
    const nested = el?.closest("[data-scrollable]");
    if (nested && nested !== root) return;
    setUi("scrollGesture", Date.now());
  };
  const hasScrollGesture = () => Date.now() - ui.scrollGesture < scrollGestureWindowMs;
  const [sessionSync] = createResource(() => [sdk.directory, params.id], ([directory, id]) => {
    if (refreshFrame !== undefined) cancelAnimationFrame(refreshFrame);
    if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    refreshFrame = undefined;
    refreshTimer = undefined;
    if (!id) return;
    const cached = untrack(() => sync.data?.message?.[id] !== undefined);
    const stale = !cached ? false : (() => {
      const info = getSessionPrefetch(directory, id);
      if (!info) return true;
      return Date.now() - info.at > SESSION_PREFETCH_TTL;
    })();
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = undefined;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        if (params.id !== id) return;
        untrack(() => {
          if (stale) void sync.session.sync(id, {
            force: true
          });
        });
      }, 0);
    });
    return sync.session.sync(id);
  });
  createEffect(on(() => {
    const id = params.id;
    return [sdk.directory, id, id ? sync.data?.session_status?.[id]?.type ?? "idle" : "idle", id ? composer.blocked() : false];
  }, ([dir, id, status, blocked]) => {
    if (todoFrame !== undefined) cancelAnimationFrame(todoFrame);
    if (todoTimer !== undefined) window.clearTimeout(todoTimer);
    todoFrame = undefined;
    todoTimer = undefined;
    if (!id) return;
    if (status === "idle" && !blocked) return;
    const cached = untrack(() => sync.data?.todo?.[id] !== undefined || globalSync.data.session_todo[id] !== undefined);
    todoFrame = requestAnimationFrame(() => {
      todoFrame = undefined;
      todoTimer = window.setTimeout(() => {
        todoTimer = undefined;
        if (sdk.directory !== dir || params.id !== id) return;
        untrack(() => {
          void sync.session.todo(id, cached ? {
            force: true
          } : undefined);
        });
      }, 0);
    });
  }, {
    defer: true
  }));
  createEffect(on(() => visibleUserMessages().at(-1)?.id, (lastId, prevLastId) => {
    if (lastId && prevLastId && lastId > prevLastId) {
      setStore("messageId", undefined);
    }
  }, {
    defer: true
  }));
  createEffect(on(sessionKey, () => {
    setStore("messageId", undefined);
    setStore("changes", "git");
    setUi("pendingMessage", undefined);
  }, {
    defer: true
  }));
  onCleanup(controller.listenVcsWatcher());
  onCleanup(controller.listenVcsFileDiff());
  createEffect(on(() => params.dir, dir => {
    if (!dir) return;
    setStore("newSessionWorktree", "main");
  }, {
    defer: true
  }));
  const selectionPreview = (path, selection) => {
    const content = file.get(path)?.content?.content;
    if (!content) return undefined;
    return previewSelectedLines(content, {
      start: selection.startLine,
      end: selection.endLine
    });
  };
  const addCommentToContext = input => {
    const selection = selectionFromLines(input.selection);
    const preview = input.preview ?? selectionPreview(input.file, selection);
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
    prompt.context.updateComment(input.file, input.id, {
      comment: input.comment,
      ...(input.preview ? {
        preview: input.preview
      } : {})
    });
  };
  const removeCommentFromContext = input => {
    comments.remove(input.file, input.id);
    prompt.context.removeComment(input.file, input.id);
  };
  const reviewCommentActions = createMemo(() => ({
    moreLabel: language.t("common.moreOptions"),
    editLabel: language.t("common.edit"),
    deleteLabel: language.t("common.delete"),
    saveLabel: language.t("common.save")
  }));
  const isEditableTarget = target => {
    if (!(target instanceof HTMLElement)) return false;
    return /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName) || target.isContentEditable;
  };
  const deepActiveElement = () => {
    let current = document.activeElement;
    while (current instanceof HTMLElement && current.shadowRoot?.activeElement) {
      current = current.shadowRoot.activeElement;
    }
    return current instanceof HTMLElement ? current : undefined;
  };
  const handleKeyDown = event => {
    const path = event.composedPath();
    const target = path.find(item => item instanceof HTMLElement);
    const activeElement = deepActiveElement();
    const protectedTarget = path.some(item => item instanceof HTMLElement && item.closest("[data-prevent-autofocus]") !== null);
    if (protectedTarget || isEditableTarget(target)) return;
    if (activeElement) {
      const isProtected = activeElement.closest("[data-prevent-autofocus]");
      const isInput = isEditableTarget(activeElement);
      if (isProtected || isInput) return;
    }
    if (dialog.active) return;
    if (activeElement === inputRef) {
      if (event.key === "Escape") inputRef?.blur();
      return;
    }

    // Prefer the open terminal over the composer when it can take focus
    if (view().terminal.opened()) {
      const id = terminal.active();
      if (id && shouldFocusTerminalOnKeyDown(event) && focusTerminalById(id)) return;
    }

    // Only treat explicit scroll keys as potential "user scroll" gestures.
    if (event.key === "PageUp" || event.key === "PageDown" || event.key === "Home" || event.key === "End") {
      markScrollGesture();
      return;
    }
    if (event.key.length === 1 && event.key !== "Unidentified" && !(event.ctrlKey || event.metaKey)) {
      if (composer.blocked() || isChildSession()) return;
      inputRef?.focus();
    }
  };
  createEffect(() => {
    const list = changesOptions();
    if (list.includes(store.changes)) return;
    const next = list[0];
    if (!next) return;
    setStore("changes", next);
  });
  createEffect(on(() => sync.data?.session_status?.[params.id ?? ""]?.type, (next, prev) => {
    if (next !== "idle" || prev === undefined || prev === "idle") return;
    refreshVcs();
  }, {
    defer: true
  }));
  const fileTreeTab = () => layout.fileTree.tab();
  const setFileTreeTab = value => layout.fileTree.setTab(value);
  const [tree, setTree] = createStore({
    reviewScroll: undefined,
    pendingDiff: undefined,
    activeDiff: undefined
  });
  createEffect(on(sessionKey, () => {
    setTree({
      reviewScroll: undefined,
      pendingDiff: undefined,
      activeDiff: undefined
    });
  }, {
    defer: true
  }));
  const showAllFiles = () => {
    if (fileTreeTab() !== "changes") return;
    setFileTreeTab("all");
  };
  const focusInput = () => {
    if (isChildSession()) return;
    inputRef?.focus();
  };
  useSessionCommands({
    navigateMessageByOffset,
    setActiveMessage,
    focusInput,
    review: reviewTab
  });
  const openReviewFile = createOpenReviewFile({
    showAllFiles,
    tabForPath: file.tab,
    openTab: tabs().open,
    setActive: tabs().setActive,
    loadFile: file.load
  });
  const openFileFromTree = path => {
    const tab = file.tab(path);
    file.load(path);
    tabs().open(tab);
    tabs().setActive(tab);
    openReviewPanel();
  };
  // Close a session tab = archive it; if it was the active session, switch to
  // another (or a fresh new session).
  const archiveSessionTab = async session => {
    if (!session?.id) return;
    const wasActive = session.id === params.id;
    try { await controller.archiveSession(session.id); } catch (e) { console.error("[session] archive", e); }
    if (!wasActive) return;
    const remaining = sessionTabList().filter(s => s.id !== session.id);
    const dir = sdk.directory;
    if (remaining[0]) navigate(`/${base64Encode(remaining[0].directory)}/session/${remaining[0].id}`);
    else if (dir) navigate(`/${base64Encode(dir)}/session`);
  };
  // Center file tab bar: handler + drag-and-drop
  const openFileTab = createOpenSessionFileTab({
    normalizeTab,
    openTab: tabs().open,
    pathFromTab: file.pathFromTab,
    loadFile: file.load,
    openReviewPanel,
    setActive: tabs().setActive
  });
  const [fileDnd, setFileDnd] = createStore({ activeDraggable: undefined });
  const handleFileDragStart = event => {
    const id = getDraggableId(event);
    if (!id) return;
    setFileDnd("activeDraggable", id);
  };
  const handleFileDragOver = event => {
    const { draggable, droppable } = event;
    if (!draggable || !droppable) return;
    const currentTabs = tabs().all();
    const toIndex = getTabReorderIndex(currentTabs, draggable.id.toString(), droppable.id.toString());
    if (toIndex === undefined) return;
    tabs().move(draggable.id.toString(), toIndex);
  };
  const handleFileDragEnd = () => {
    setFileDnd("activeDraggable", undefined);
  };
  const changesTitle = () => {
    if (!canReview()) {
      return null;
    }
    const label = option => {
      if (option === "git") return language.t("ui.sessionReview.title.git");
      if (option === "branch") return language.t("ui.sessionReview.title.branch");
      return language.t("ui.sessionReview.title.lastTurn");
    };
    return createComponent(Select, {
      get options() {
        return changesOptions();
      },
      get current() {
        return store.changes;
      },
      label: label,
      onSelect: option => option && setStore("changes", option),
      variant: "ghost",
      size: "small",
      valueClass: "fw-medium"
    });
  };
  // Empty-state container (_tmpl$): callers pass an already-evaluated string,
  // matching the compiled static insert.
  const empty = text => {
    const root = template(`<div class="h-full pb-64 -mt-4 d-flex flex-column align-items-center justify-content-center text-center gap-6"><div class="text-secondary max-w-56"></div></div>`);
    root.firstChild.textContent = text;
    return root;
  };
  // "Create git repo" empty state (_tmpl$2).
  const createGit = input => {
    const root = template(`<div><div class="d-flex flex-column gap-3"><div class="fw-medium text-body-emphasis"></div><div class="text-body max-w-md" style="line-height:var(--line-height-normal)"></div></div></div>`);
    const column = root.firstChild;
    const titleEl = column.firstChild;
    const descriptionEl = titleEl.nextSibling;
    createRenderEffect(() => {
      titleEl.textContent = language.t("session.review.noVcs.createGit.title");
    });
    createRenderEffect(() => {
      descriptionEl.textContent = language.t("session.review.noVcs.createGit.description");
    });
    // Button (bs) returns a concrete element; its children getter is read once
    // at creation, exactly as it was for the compiled getter.
    root.appendChild(createComponent(Button, {
      size: "large",
      get disabled() {
        return controller.gitPending();
      },
      onClick: initGit,
      get children() {
        return controller.gitPending() ? language.t("session.review.noVcs.createGit.actionLoading") : language.t("session.review.noVcs.createGit.action");
      }
    }));
    // Change-guarded className, mirroring the compiled className() effect.
    let prevClass;
    createRenderEffect(() => {
      const next = input.emptyClass;
      if (next === prevClass) return;
      prevClass = next;
      if (next == null) root.removeAttribute("class");
      else root.className = next;
    });
    return root;
  };
  const reviewEmptyText = createMemo(() => {
    if (store.changes === "git") return language.t("session.review.noUncommittedChanges");
    if (store.changes === "branch") return language.t("session.review.noBranchChanges");
    return language.t("session.review.noChanges");
  });
  const reviewEmpty = input => {
    if (store.changes === "git" || store.changes === "branch") {
      if (!reviewReady()) {
        // Loading placeholder (_tmpl$3) with a live translated label.
        const loading = template(`<div></div>`);
        createRenderEffect(() => {
          loading.textContent = language.t("session.review.loadingChanges");
        });
        let prevClass;
        createRenderEffect(() => {
          const next = input.loadingClass;
          if (next === prevClass) return;
          prevClass = next;
          if (next == null) loading.removeAttribute("class");
          else loading.className = next;
        });
        return loading;
      }
      return empty(reviewEmptyText());
    }
    if (store.changes === "turn") {
      if (nogit()) return createGit(input);
      return empty(reviewEmptyText());
    }
    // Fallback empty state (_tmpl$4) with a live message.
    const root = template(`<div><div class="text-secondary max-w-56"></div></div>`);
    const messageEl = root.firstChild;
    createRenderEffect(() => {
      messageEl.textContent = reviewEmptyText();
    });
    let prevClass;
    createRenderEffect(() => {
      const next = input.emptyClass;
      if (next === prevClass) return;
      prevClass = next;
      if (next == null) root.removeAttribute("class");
      else root.className = next;
    });
    return root;
  };
  const reviewContent = input => createComponent(Show, {
    get when() {
      return !store.deferRender;
    },
    get children() {
      return createComponent(SessionReviewTab, {
        get title() {
          return changesTitle();
        },
        get empty() {
          return reviewEmpty(input);
        },
        diffs: reviewDiffs,
        view: view,
        get diffStyle() {
          return input.diffStyle;
        },
        get onDiffStyleChange() {
          return input.onDiffStyleChange;
        },
        onScrollRef: el => setTree("reviewScroll", el),
        get focusedFile() {
          return tree.activeDiff;
        },
        onLineComment: comment => addCommentToContext({
          ...comment,
          origin: "review"
        }),
        onLineCommentUpdate: updateCommentInContext,
        onLineCommentDelete: removeCommentFromContext,
        get lineCommentActions() {
          return reviewCommentActions();
        },
        get commentMentions() {
          return {
            items: file.searchFilesAndDirectories
          };
        },
        get comments() {
          return comments.all();
        },
        get focusedComment() {
          return comments.focus();
        },
        get onFocusedCommentChange() {
          return comments.setFocus;
        },
        onViewFile: openReviewFile,
        get classes() {
          return input.classes;
        }
      });
    }
  });
  const reviewPanel = () => {
    // Review panel shell (_tmpl$5); reviewContent() returns a Show accessor,
    // so it stays a live insert.
    const root = template(`<div class="d-flex flex-column h-full overflow-hidden bg-body contain-strict"><div class="relative pt-2 flex-1 min-h-0 overflow-hidden"></div></div>`);
    _solidInsert(root.firstChild, () => reviewContent({
      diffStyle: layout.review.diffStyle(),
      onDiffStyleChange: layout.review.setDiffStyle,
      loadingClass: "px-6 py-4 text-secondary",
      emptyClass: "h-full pb-64 -mt-4 d-flex flex-column align-items-center justify-content-center text-center gap-6"
    }));
    return root;
  };
  createEffect(on(activeFileTab, active => {
    if (!active) return;
    if (fileTreeTab() !== "changes") return;
    showAllFiles();
  }, {
    defer: true
  }));
  const reviewDiffId = path => {
    const sum = checksum(path);
    if (!sum) return;
    return `session-review-diff-${sum}`;
  };
  const reviewDiffTop = path => {
    const root = tree.reviewScroll;
    if (!root) return;
    const id = reviewDiffId(path);
    if (!id) return;
    const el = document.getElementById(id);
    if (!(el instanceof HTMLElement)) return;
    if (!root.contains(el)) return;
    const a = el.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    return a.top - b.top + root.scrollTop;
  };
  const scrollToReviewDiff = path => {
    const root = tree.reviewScroll;
    if (!root) return false;
    const top = reviewDiffTop(path);
    if (top === undefined) return false;
    view().setScroll("review", {
      x: root.scrollLeft,
      y: top
    });
    root.scrollTo({
      top,
      behavior: "auto"
    });
    return true;
  };
  const focusReviewDiff = path => {
    openReviewPanel();
    view().review.openPath(path);
    setTree({
      activeDiff: path,
      pendingDiff: path
    });
  };
  createEffect(() => {
    const pending = tree.pendingDiff;
    if (!pending) return;
    if (!tree.reviewScroll) return;
    if (!reviewReady()) return;
    const attempt = count => {
      if (tree.pendingDiff !== pending) return;
      if (count > 60) {
        setTree("pendingDiff", undefined);
        return;
      }
      const root = tree.reviewScroll;
      if (!root) {
        requestAnimationFrame(() => attempt(count + 1));
        return;
      }
      if (!scrollToReviewDiff(pending)) {
        requestAnimationFrame(() => attempt(count + 1));
        return;
      }
      const top = reviewDiffTop(pending);
      if (top === undefined) {
        requestAnimationFrame(() => attempt(count + 1));
        return;
      }
      if (Math.abs(root.scrollTop - top) <= 1) {
        setTree("pendingDiff", undefined);
        return;
      }
      requestAnimationFrame(() => attempt(count + 1));
    };
    requestAnimationFrame(() => attempt(0));
  });
  createEffect(() => {
    const id = params.id;
    if (!id) return;
    if (!wantsReview()) return;
    if (sync.data?.session_diff?.[id] !== undefined) return;
    if (sync.status === "loading") return;
    void sync.session.diff(id);
  });
  createEffect(on(() => [sessionKey(), wantsReview()], ([key, wants]) => {
    if (diffFrame !== undefined) cancelAnimationFrame(diffFrame);
    if (diffTimer !== undefined) window.clearTimeout(diffTimer);
    diffFrame = undefined;
    diffTimer = undefined;
    if (!wants) return;
    const id = params.id;
    if (!id) return;
    if (!untrack(() => sync.data?.session_diff?.[id] !== undefined)) return;
    diffFrame = requestAnimationFrame(() => {
      diffFrame = undefined;
      diffTimer = window.setTimeout(() => {
        diffTimer = undefined;
        if (sessionKey() !== key) return;
        void sync.session.diff(id, {
          force: true
        });
      }, 0);
    });
  }, {
    defer: true
  }));
  let treeDir;
  createEffect(() => {
    const dir = sdk.directory;
    if (!isDesktop()) return;
    if (!layout.fileTree.opened()) return;
    if (sync.status === "loading") return;
    fileTreeTab();
    const refresh = treeDir !== dir;
    treeDir = dir;
    void (refresh ? file.tree.refresh("") : file.tree.list(""));
  });
  createEffect(on(() => sdk.directory, () => {
    const tab = activeFileTab();
    if (!tab) return;
    const path = file.pathFromTab(tab);
    if (!path) return;
    void file.load(path, {
      force: true
    });
  }, {
    defer: true
  }));
  const autoScroll = createAutoScroll({
    working: () => true,
    overflowAnchor: "dynamic"
  });
  let scrollStateFrame;
  let scrollStateTarget;
  let fillFrame;
  const jumpThreshold = el => Math.max(400, el.clientHeight);
  const updateScrollState = el => {
    const max = el.scrollHeight - el.clientHeight;
    const distance = max - el.scrollTop;
    const overflow = max > 1;
    const bottom = !overflow || distance <= 2;
    const jump = overflow && distance > jumpThreshold(el);
    if (ui.scroll.overflow === overflow && ui.scroll.bottom === bottom && ui.scroll.jump === jump) return;
    setUi("scroll", {
      overflow,
      bottom,
      jump
    });
  };
  const scheduleScrollState = el => {
    scrollStateTarget = el;
    if (scrollStateFrame !== undefined) return;
    scrollStateFrame = requestAnimationFrame(() => {
      scrollStateFrame = undefined;
      const target = scrollStateTarget;
      scrollStateTarget = undefined;
      if (!target) return;
      updateScrollState(target);
    });
  };
  const resumeScroll = () => {
    setStore("messageId", undefined);
    autoScroll.forceScrollToBottom();
    clearMessageHash();
    const el = scroller;
    if (el) scheduleScrollState(el);
  };

  // When the user returns to the bottom, treat the active message as "latest".
  createEffect(on(autoScroll.userScrolled, scrolled => {
    if (scrolled) return;
    setStore("messageId", undefined);
    clearMessageHash();
  }, {
    defer: true
  }));
  let fill = () => {};
  const setScrollRef = el => {
    scroller = el;
    autoScroll.scrollRef(el);
    if (!el) return;
    scheduleScrollState(el);
    fill();
  };
  const markUserScroll = () => {
    scrollMark += 1;
  };
  createResizeObserver(() => content, () => {
    const el = scroller;
    if (el) scheduleScrollState(el);
    fill();
  });
  const historyWindow = createSessionHistoryWindow({
    sessionID: () => params.id,
    messagesReady,
    loaded: () => messages().length,
    visibleUserMessages,
    historyMore,
    historyLoading,
    loadMore: sessionID => sync.session.history.loadMore(sessionID),
    userScrolled: autoScroll.userScrolled,
    scroller: () => scroller
  });
  fill = () => {
    if (fillFrame !== undefined) return;
    fillFrame = requestAnimationFrame(() => {
      fillFrame = undefined;
      if (!params.id || !messagesReady()) return;
      if (autoScroll.userScrolled() || historyLoading()) return;
      const el = scroller;
      if (!el) return;
      if (el.scrollHeight > el.clientHeight + 1) return;
      if (historyWindow.turnStart() <= 0 && !historyMore()) return;
      void historyWindow.loadAndReveal();
    });
  };
  createEffect(on(() => [params.id, messagesReady(), historyWindow.turnStart(), historyMore(), historyLoading(), autoScroll.userScrolled(), visibleUserMessages().length], ([id, ready, start, more, loading, scrolled]) => {
    if (!id || !ready || loading || scrolled) return;
    if (start <= 0 && !more) return;
    fill();
  }, {
    defer: true
  }));
  const draft = id => extractPromptFromParts(sync.data?.part?.[id] ?? [], {
    directory: sdk.directory,
    attachmentName: language.t("common.attachment")
  });
  const line = id => {
    const text = draft(id).map(part => part.type === "image" ? `[image:${part.filename}]` : part.content).join("").replace(/\s+/g, " ").trim();
    if (text) return text;
    return `[${language.t("common.attachment")}]`;
  };
  const busy = sessionID => {
    if ((sync.data?.session_status?.[sessionID] ?? {
      type: "idle"
    }).type !== "idle") return true;
    return (sync.data?.message?.[sessionID] ?? []).some(item => item.role === "assistant" && typeof item.time.completed !== "number");
  };
  const queuedFollowups = createMemo(() => {
    const id = params.id;
    if (!id) return emptyFollowups;
    return followup.items[id] ?? emptyFollowups;
  });
  const editingFollowup = createMemo(() => {
    const id = params.id;
    if (!id) return;
    return followup.edit[id];
  });
  const followupBusy = sessionID => controller.followupBusy(sessionID);
  const sendingFollowup = createMemo(() => {
    const id = params.id;
    if (!id) return;
    if (!followupBusy(id)) return;
    return controller.followupVariableId();
  });
  const queueEnabled = createMemo(() => {
    const id = params.id;
    if (!id) return false;
    return settings.general.followup() === "queue" && busy(id) && !composer.blocked() && !isChildSession();
  });
  const followupText = item => {
    const text = item.prompt.map(part => {
      if (part.type === "image") return `[image:${part.filename}]`;
      if (part.type === "file") return `[file:${part.path}]`;
      if (part.type === "agent") return `@${part.name}`;
      return part.content;
    }).join("").split(/\r?\n/).map(line => line.trim()).find(line => !!line);
    if (text) return text;
    return `[${language.t("common.attachment")}]`;
  };
  const queueFollowup = draft => controller.queueFollowup(draft);
  const followupDock = createMemo(() => queuedFollowups().map(item => ({
    id: item.id,
    text: followupText(item)
  })));
  const sendFollowup = (sessionID, id, opts) => controller.sendFollowup(sessionID, id, opts);
  const editFollowup = id => controller.editFollowup(id, queuedFollowups());
  const clearFollowupEdit = () => controller.clearFollowupEdit();
  const reverting = controller.reverting;
  const restoring = controller.restoring;
  const revert = input => controller.revert(input);
  const restore = id => controller.restore(id);
  const rolled = createMemo(() => {
    const id = revertMessageID();
    if (!id) return [];
    return userMessages().filter(item => item.id >= id).map(item => ({
      id: item.id,
      text: line(item.id)
    }));
  });
  const actions = {
    revert
  };
  createEffect(() => {
    const sessionID = params.id;
    if (!sessionID) return;
    const item = queuedFollowups()[0];
    if (!item) return;
    if (followupBusy(sessionID)) return;
    if (followup.failed[sessionID] === item.id) return;
    if (followup.paused[sessionID]) return;
    if (isChildSession()) return;
    if (composer.blocked()) return;
    if (busy(sessionID)) return;
    void sendFollowup(sessionID, item.id);
  });
  createResizeObserver(() => promptDock, ({
    height
  }) => {
    const next = Math.ceil(height);
    if (next === dockHeight) return;
    const el = scroller;
    const delta = next - dockHeight;
    const stick = el ? !autoScroll.userScrolled() || el.scrollHeight - el.clientHeight - el.scrollTop < 10 + Math.max(0, delta) : false;
    dockHeight = next;
    if (stick) autoScroll.forceScrollToBottom();
    if (el) scheduleScrollState(el);
    fill();
  });
  const {
    clearMessageHash,
    scrollToMessage
  } = useSessionHashScroll({
    sessionKey,
    sessionID: () => params.id,
    messagesReady,
    visibleUserMessages,
    historyMore,
    historyLoading,
    loadMore: sessionID => sync.session.history.loadMore(sessionID),
    turnStart: historyWindow.turnStart,
    currentMessageId: () => store.messageId,
    pendingMessage: () => ui.pendingMessage,
    setPendingMessage: value => setUi("pendingMessage", value),
    setActiveMessage,
    setTurnStart: historyWindow.setTurnStart,
    autoScroll,
    scroller: () => scroller,
    anchor,
    scheduleScrollState,
    consumePendingMessage: layout.pendingMessage.consume
  });
  createEffect(on(() => params.id, id => {
    if (!id) requestAnimationFrame(() => inputRef?.focus());
  }));
  onMount(() => {
    makeEventListener(document, "keydown", handleKeyDown);
  });
  onCleanup(() => {
    if (reviewFrame !== undefined) cancelAnimationFrame(reviewFrame);
    if (refreshFrame !== undefined) cancelAnimationFrame(refreshFrame);
    if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    if (todoFrame !== undefined) cancelAnimationFrame(todoFrame);
    if (todoTimer !== undefined) window.clearTimeout(todoTimer);
    if (diffFrame !== undefined) cancelAnimationFrame(diffFrame);
    if (diffTimer !== undefined) window.clearTimeout(diffTimer);
    if (scrollStateFrame !== undefined) cancelAnimationFrame(scrollStateFrame);
    if (fillFrame !== undefined) cancelAnimationFrame(fillFrame);
  });
  // ----- Static skeleton (_tmpl$6): root > row > center column with the
  // editor area on top and the chat pane below -----
  const rootEl = template(`<div class="relative bg-body size-full overflow-hidden d-flex flex-column"><div class="flex-1 min-h-0 d-flex flex-row"><div><div class="flex-1 min-h-0 overflow-hidden"></div><div class="d-flex flex-column overflow-hidden shrink-0"></div></div></div></div>`);
  const rowEl = rootEl.firstChild;
  const centerEl = rowEl.firstChild;
  const editorEl = centerEl.firstChild;
  const chatPaneEl = editorEl.nextSibling;
  // The resource read stays a live insert (before the row), as compiled.
  _solidInsert(rootEl, () => sessionSync() ?? "", rowEl);
  _solidInsert(rootEl, createComponent(SessionHeader, {}), rowEl);
  // Session tab bar lives at the TOP of the bottom chat pane (chatPaneEl),
  // replacing the in-chat session title. Inserted while chatPaneEl is still
  // empty so it ends up above the message timeline + composer.
  _solidInsert(chatPaneEl, createComponent(SessionTabBar, {
    sessions: sessionTabList,
    currentId: () => params.id,
    onSelect: session => navigate(`/${base64Encode(session.directory)}/session/${session.id}`),
    onNew: () => {
      const dir = sdk.directory;
      if (dir) navigate(`/${base64Encode(dir)}/session`);
    },
    // "×" hides the bottom chat pane (reopen via the toolbar chat button).
    onClose: () => view().chatPanel.close()
  }), null);
  // Mobile session/changes switcher, inserted before the center column.
  _solidInsert(rowEl, createComponent(Show, {
    get when() {
      return !isDesktop() && !!params.id;
    },
    get children() {
      return createComponent(Tabs, {
        get value() {
          return store.mobileTab;
        },
        "class": "h-auto",
        get children() {
          return createComponent(Tabs.List, {
            get children() {
              return [createComponent(Tabs.Trigger, {
                value: "session",
                "class": "!w-1/2 !max-w-none",
                classes: {
                  button: "w-100"
                },
                onClick: () => setStore("mobileTab", "session"),
                get children() {
                  return language.t("session.tab.session");
                }
              }), createComponent(Tabs.Trigger, {
                value: "changes",
                "class": "!w-1/2 !max-w-none !border-r-0",
                classes: {
                  button: "w-100"
                },
                onClick: () => setStore("mobileTab", "changes"),
                get children() {
                  return hasReview() ? language.t("session.review.filesChanged", {
                    count: reviewCount()
                  }) : language.t("session.review.change.other");
                }
              })];
            }
          });
        }
      });
    }
  }), centerEl);
  // --- TOP: editor area (editorEl) with center file tab bar ---
  _solidInsert(editorEl, createComponent(DragDropProvider, {
    onDragStart: handleFileDragStart,
    onDragEnd: handleFileDragEnd,
    onDragOver: handleFileDragOver,
    collisionDetector: closestCenter,
    get children() {
      return [createComponent(DragDropSensors, {}), createComponent(ConstrainDragYAxis, {}), createComponent(Tabs, {
        get value() {
          return activeFileTab();
        },
        onChange: openFileTab,
        "class": "h-full",
        get children() {
          return [createComponent(Show, {
            get when() {
              return openedTabs().length > 0;
            },
            get children() {
              // Sticky file tab bar (_tmpl$8).
              const bar = template(`<div class="sticky top-0 shrink-0 d-flex bg-body z-10 border-bottom"></div>`);
              _solidInsert(bar, createComponent(Tabs.List, {
                ref: el => {
                  const stop = createFileTabListSync({
                    el,
                    contextOpen
                  });
                  onCleanup(stop);
                },
                get children() {
                  return [createComponent(SortableProvider, {
                    get ids() {
                      return openedTabs();
                    },
                    get children() {
                      // Runtime For keeps tab nodes stable across reorders,
                      // which solid-dnd's sortable transforms rely on.
                      return createComponent(For, {
                        get each() {
                          return openedTabs();
                        },
                        children: tab => createComponent(SortableTab, {
                          tab: tab,
                          get onTabClose() {
                            return tabs().close;
                          }
                        })
                      });
                    }
                  }), (() => {
                    // "+" cell pinned at the right edge of the bar (_tmpl$9).
                    const plusCell = template(`<div class="bg-body h-100 shrink-0 sticky right-0 z-10 d-flex align-items-center justify-content-center px-2"></div>`);
                    plusCell.appendChild(createComponent(TooltipKeybind, {
                      get title() {
                        return language.t("command.file.open");
                      },
                      get keybind() {
                        return command.keybind("file.open");
                      },
                      "class": "d-flex align-items-center",
                      get children() {
                        return createComponent(IconButton, {
                          icon: "plus-small",
                          variant: "ghost",
                          iconSize: "large",
                          "class": "!rounded-md",
                          onClick: () => {
                            // Create a blank untitled file in the project dir and open it
                            // as a new tab (no file-picker modal).
                            void (async () => {
                              const dir = sdk.directory;
                              if (!dir) return;
                              const base = dir.replace(/[\\/]+$/, "");
                              let name = "untitled.md", abs = base + "/" + name, n = 1;
                              while (openedTabs().some(t => t.endsWith("/" + name)) && n < 100) {
                                n++;
                                name = `untitled-${n}.md`;
                                abs = base + "/" + name;
                              }
                              // Do NOT touch the disk here: creating the empty file on
                              // "+" wrote to the project before the user asked. The tab
                              // opens against the (not-yet-existing) path; the file is
                              // only written when the Save button (bindSave) is pressed.
                              openFileFromTree(abs);
                            })();
                          },
                          get ["aria-label"]() {
                            return language.t("command.file.open");
                          }
                        });
                      }
                    }));
                    return plusCell;
                  })()];
                }
              }));
              return bar;
            }
          }), (() => {
            // Active tab content host (_tmpl$11).
            const contentWrap = template(`<div class="flex-1 min-h-0 overflow-hidden"></div>`);
            _solidInsert(contentWrap, createComponent(Switch, {
              get children() {
                return [createComponent(Match, {
                  get when() {
                    return activeFileTab();
                  },
                  get children() {
                    return createComponent(Show, {
                      get when() {
                        return activeFileTab();
                      },
                      keyed: true,
                      children: tab => createComponent(FileTabContent, {
                        tab: tab
                      })
                    });
                  }
                }), createComponent(Match, {
                  get when() {
                    return params.id;
                  },
                  get children() {
                    // Empty editor state (_tmpl$7): icon + hint + recent diffs.
                    const emptyState = template(`<div class="h-full d-flex flex-column align-items-center justify-content-center text-center gap-3"><i class="bi bi-code-square" style="font-size:3rem;opacity:0.12"></i><div class="text-secondary small"></div><div class="text-start w-100" style="max-width:320px"></div></div>`);
                    const hintEl = emptyState.firstChild.nextSibling;
                    const fileListEl = hintEl.nextSibling;
                    createRenderEffect(() => {
                      hintEl.textContent = language.t("session.files.selectToOpen");
                    });
                    _solidInsert(fileListEl, createComponent(Show, {
                      get when() {
                        return diffs().length > 0;
                      },
                      get children() {
                        return createComponent(For, {
                          get each() {
                            return diffs().slice(0, 10);
                          },
                          children: d => {
                            // Changed-file shortcut row (_tmpl$12).
                            const row = template(`<button class="btn btn-sm text-start w-100 py-1 px-2 d-flex align-items-center gap-2 text-body-secondary border-0 rounded empty-state-file" type="button" style="background:transparent"><i class="bi small"></i><span class="text-truncate flex-1 small"></span></button>`);
                            const iconEl = row.firstChild;
                            const nameEl = iconEl.nextSibling;
                            row.addEventListener("click", () => openFileFromTree(d.file));
                            row.title = d.file;
                            // d may be a store proxy, so the status-driven icon
                            // class stays reactive, like the compiled effect.
                            createRenderEffect(() => {
                              iconEl.className = "bi " + (d.status === "added" ? "bi-file-earmark-plus text-success" : d.status === "deleted" ? "bi-file-earmark-minus text-danger" : "bi-file-earmark-diff text-warning") + " small";
                            });
                            // d.file was read once by the compiled insert.
                            nameEl.textContent = d.file;
                            return row;
                          }
                        });
                      }
                    }));
                    return emptyState;
                  }
                }), createComponent(Match, {
                  when: true,
                  get children() {
                    return createComponent(NewSessionView, {
                      get worktree() {
                        return newSessionWorktree();
                      }
                    });
                  }
                })];
              }
            }));
            return contentWrap;
          })()];
        }
      }), createComponent(DragOverlay, {
        get children() {
          return createComponent(Show, {
            get when() {
              return fileDnd.activeDraggable;
            },
            keyed: true,
            children: tab => {
              const path = file.pathFromTab(tab);
              // Floating copy of the dragged tab's label (_tmpl$10).
              const preview = template(`<div data-component="tabs-drag-preview"></div>`);
              _solidInsert(preview, createComponent(Show, {
                when: path,
                children: p => createComponent(FileVisual, {
                  active: true,
                  get path() {
                    return p();
                  }
                })
              }));
              return preview;
            }
          });
        }
      })];
    }
  }));
  // --- Vertical resize handle between editor and chat ---
  _solidInsert(centerEl, createComponent(Show, {
    get when() {
      return params.id && view().chatPanel.opened();
    },
    get children() {
      const host = template(`<div></div>`);
      _solidInsert(host, createComponent(ResizeHandle, {
        direction: "vertical",
        edge: "start",
        // The handle is absolute within the center column; anchor it to the
        // TOP edge of the chat pane (which is `chatPanel.height()` tall at the
        // bottom) so it sits on the editor/chat boundary. Default CSS would
        // pin it to the center's top (unreachable).
        get style() {
          return `inset-block-start:auto;inset-block-end:${layout.chatPanel.height()}px;transform:translateY(50%);`;
        },
        get size() {
          return layout.chatPanel.height();
        },
        min: 120,
        get max() {
          return typeof window === "undefined" ? 600 : Math.floor(window.innerHeight * 0.7);
        },
        onResize: height => {
          size.touch();
          layout.chatPanel.resize(height);
        },
        onCollapse: () => view().chatPanel.close(),
        collapseThreshold: 80
      }));
      return host;
    }
  }), chatPaneEl);
  // --- BOTTOM: chat pane (chatPaneEl) ---
  // Keep the timeline inside the remaining flex space so the composer stays
  // inside the chat pane instead of being pushed below the viewport.
  const chatTimelinePane = document.createElement("div");
  chatTimelinePane.className = "flex-1 min-h-0 overflow-hidden";
  chatPaneEl.appendChild(chatTimelinePane);
  _solidInsert(chatTimelinePane, createComponent(Show, {
    get when() {
      return params.id && view().chatPanel.opened();
    },
    get children() {
      return createComponent(Show, {
        get when() {
          return messagesReady();
        },
        get children() {
          return createComponent(MessageTimeline, {
            get mobileChanges() {
              return mobileChanges();
            },
            get mobileFallback() {
              return reviewContent({
                diffStyle: "unified",
                classes: {
                  root: "pb-8",
                  header: "px-4",
                  container: "px-4"
                },
                loadingClass: "px-4 py-4 text-secondary",
                emptyClass: "h-full pb-64 -mt-4 d-flex flex-column align-items-center justify-content-center text-center gap-6"
              });
            },
            actions: actions,
            get scroll() {
              return ui.scroll;
            },
            onResumeScroll: resumeScroll,
            setScrollRef: setScrollRef,
            onScheduleScrollState: scheduleScrollState,
            get onAutoScrollHandleScroll() {
              return autoScroll.handleScroll;
            },
            onMarkScrollGesture: markScrollGesture,
            hasScrollGesture: hasScrollGesture,
            onUserScroll: markUserScroll,
            get onTurnBackfillScroll() {
              return historyWindow.onScrollerScroll;
            },
            get onAutoScrollInteraction() {
              return autoScroll.handleInteraction;
            },
            get centered() {
              return centered();
            },
            setContentRef: el => {
              content = el;
              autoScroll.contentRef(el);
              const root = scroller;
              if (root) scheduleScrollState(root);
            },
            get turnStart() {
              return historyWindow.turnStart();
            },
            get historyMore() {
              return historyMore();
            },
            get historyLoading() {
              return historyLoading();
            },
            onLoadEarlier: () => {
              void historyWindow.loadAndReveal();
            },
            get renderedUserMessages() {
              return historyWindow.renderedUserMessages();
            },
            anchor: anchor
          });
        }
      });
    }
  }));
  _solidInsert(chatPaneEl, createComponent(SessionComposerRegion, {
    state: composer,
    get ready() {
      return !store.deferRender && messagesReady();
    },
    get centered() {
      return centered();
    },
    inputRef: el => {
      inputRef = el;
    },
    get newSessionWorktree() {
      return newSessionWorktree();
    },
    onNewSessionWorktreeReset: () => setStore("newSessionWorktree", "main"),
    onSubmit: () => {
      comments.clear();
      resumeScroll();
    },
    onResponseSubmit: resumeScroll,
    get followup() {
      return params.id && !isChildSession() ? {
        queue: queueEnabled,
        items: followupDock(),
        sending: sendingFollowup(),
        edit: editingFollowup(),
        onQueue: queueFollowup,
        onAbort: () => controller.pauseFollowup(),
        onSend: id => {
          void sendFollowup(params.id, id, {
            manual: true
          });
        },
        onEdit: editFollowup,
        onEditLoaded: clearFollowupEdit
      } : undefined;
    },
    get revert() {
      return rolled().length > 0 ? {
        items: rolled(),
        restoring: restoring(),
        disabled: reverting(),
        onRestore: restore
      } : undefined;
    },
    setPromptDockRef: el => {
      promptDock = el;
    }
  }), null);
  // --- Horizontal resize handle for review panel width ---
  _solidInsert(centerEl, createComponent(Show, {
    get when() {
      return desktopReviewOpen();
    },
    get children() {
      const host = template(`<div></div>`);
      // Compiled delegated $$pointerdown -> direct listener (pointerdown always
      // precedes the handle's own mousedown handling, so ordering is unchanged).
      host.addEventListener("pointerdown", () => size.start());
      _solidInsert(host, createComponent(ResizeHandle, {
        direction: "horizontal",
        // edge:"start" gives the DIRECTION (drag-left-grows). The default CSS
        // for edge=start anchors the handle to the LEFT of its container; we
        // override the position to the center's RIGHT edge (= the boundary
        // with the right review panel) so the handle is actually grabbable
        // there. Without this it rendered at x≈200 (unreachable).
        edge: "start",
        style: "inset-inline-start:auto;inset-inline-end:0;transform:translateX(50%);",
        get size() {
          return layout.session.width();
        },
        min: 180,
        get max() {
          return typeof window === "undefined" ? 1000 : window.innerWidth * 0.45;
        },
        onResize: width => {
          size.touch();
          layout.session.resize(width);
        }
      }));
      return host;
    }
  }), null);
  _solidInsert(rowEl, createComponent(FileTreePane, {
    diffs: reviewDiffs,
    diffsReady: reviewReady,
    hasReview: hasReview,
    reviewCount: reviewCount,
    get activeDiff() {
      return tree.activeDiff;
    },
    onChangedFileClick: focusReviewDiff,
    onFileClick: openFileFromTree,
    onContextMenu: (node, event) => showFileContextMenu(node, event, {
      directory: sdk.directory,
      refresh: dir => file.tree.refresh(dir),
      openFile: path => openFileFromTree(path)
    }),
    size: size
  }), centerEl);
  _solidInsert(rowEl, createComponent(SessionSidePanel, {
    canReview: canReview,
    diffs: reviewDiffs,
    diffsReady: reviewReady,
    empty: reviewEmptyText,
    hasReview: hasReview,
    reviewCount: reviewCount,
    reviewPanel: reviewPanel,
    get activeDiff() {
      return tree.activeDiff;
    },
    focusReviewDiff: focusReviewDiff,
    get reviewSnap() {
      return ui.reviewSnap;
    },
    size: size
  }), null);
  _solidInsert(rootEl, createComponent(TerminalPanel, {}), null);
  // Change-guarded center-column classes/width, mirroring the compiled
  // classList()/setStyleProperty() effect block. The first class group is
  // always true, so it is applied once.
  centerEl.classList.add("@container", "relative", "flex", "flex-col", "min-h-0", "h-full", "bg-body", "flex-1", "min-w-0");
  const centerAnimationClasses = ["transition-[width]", "duration-[240ms]", "ease-[cubic-bezier(0.22,1,0.36,1)]", "will-change-[width]", "motion-reduce:transition-none"];
  let prevCenterAnimate;
  let prevCenterWidth;
  createRenderEffect(() => {
    const animate = !size.active() && !ui.reviewSnap;
    const width = sessionPanelWidth();
    if (animate !== prevCenterAnimate) {
      prevCenterAnimate = animate;
      for (const cls of centerAnimationClasses) centerEl.classList.toggle(cls, animate);
    }
    if (width !== prevCenterWidth) {
      prevCenterWidth = width;
      if (width == null) centerEl.style.removeProperty("width");
      else centerEl.style.setProperty("width", width);
    }
  });
  // chat pane height + visibility (the "×" closes the pane entirely; the
  // toolbar chat button reopens it)
  let prevChatHeight;
  let prevChatBorder;
  let prevChatDisplay;
  createRenderEffect(() => {
    const open = params.id && view().chatPanel.opened();
    const height = open ? `${layout.chatPanel.height()}px` : "";
    const borderTop = open ? "1px solid var(--bs-border-color)" : "";
    const display = view().chatPanel.opened() ? "" : "none";
    if (height !== prevChatHeight) chatPaneEl.style.setProperty("height", prevChatHeight = height);
    if (borderTop !== prevChatBorder) chatPaneEl.style.setProperty("border-top", prevChatBorder = borderTop);
    // The pane carries a `display:flex !important` utility class, so inline
    // display must use !important to override it when hiding.
    if (display !== prevChatDisplay) {
      prevChatDisplay = display;
      if (display === "none") chatPaneEl.style.setProperty("display", "none", "important");
      else chatPaneEl.style.removeProperty("display");
    }
  });
  return rootEl;
}
