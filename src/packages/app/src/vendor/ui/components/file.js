// insert() is the established exception for reactive/component-valued
// children: the presence-gated search bar (Show + Portal-backed FileSearchBar)
// must stay reconciled by Solid instead of being frozen at mount.
import { insert } from "../../../lib/reactivity.js";
import { sampledChecksum } from "core/util/encode";
import { DEFAULT_VIRTUAL_FILE_METRICS, File as PierreFile, FileDiff, VirtualizedFile, VirtualizedFileDiff, Virtualizer } from "@pierre/diffs";
import { createMediaQuery } from "../../../lib/primitives/media.js";
import { makeEventListener } from "../../../lib/primitives/event-listener.js";
import { createComponent, createEffect, createMemo, createRenderEffect, createSignal, onCleanup, onMount, Show, splitProps } from "../../../lib/reactivity.js";
import { createDefaultOptions, styleVariables } from "../pierre/index.js";
import { markCommentedDiffLines, markCommentedFileLines } from "../pierre/commented-lines.js";
import { fixDiffSelection, findDiffSide } from "../pierre/diff-selection.js";
import { createFileFind } from "../pierre/file-find.js";
import { applyViewerScheme, clearReadyWatcher, createReadyWatcher, getViewerHost, getViewerRoot, notifyShadowReady, observeViewerScheme } from "../pierre/file-runtime.js";
import { findCodeSelectionSide, findDiffLineNumber, findElement, findFileLineNumber, readShadowLineSelection } from "../pierre/file-selection.js";
import { createLineNumberSelectionBridge, restoreShadowTextSelection } from "../pierre/selection-bridge.js";
import { acquireVirtualizer, virtualMetrics } from "../pierre/virtualizer.js";
import { getWorkerPool } from "../pierre/worker.js";
import { FileMedia } from "./file-media.js";
import { FileSearchBar } from "./file-search.js";

// Build a detached element from compact, fully static HTML (no inter-element
// whitespace, matching the compiled Solid template). Translated or
// user-provided strings are never interpolated here.
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

// Faithful port of solid-js/web classList(): each key may hold multiple
// space-separated class names; keys that turned falsy are removed, truthy
// keys are added, and `prev` carries the applied state between runs.
function toggleClassKey(node, key, value) {
  const classNames = key.trim().split(/\s+/);
  for (let i = 0, nameLen = classNames.length; i < nameLen; i++) {
    node.classList.toggle(classNames[i], value);
  }
}
function applyClassList(node, value, prev) {
  const classKeys = Object.keys(value || {});
  const prevKeys = Object.keys(prev);
  let i, len;
  for (i = 0, len = prevKeys.length; i < len; i++) {
    const key = prevKeys[i];
    if (!key || key === "undefined" || value[key]) continue;
    toggleClassKey(node, key, false);
    delete prev[key];
  }
  for (i = 0, len = classKeys.length; i < len; i++) {
    const key = classKeys[i];
    const classValue = !!value[key];
    if (!key || key === "undefined" || prev[key] === classValue || !classValue) continue;
    toggleClassKey(node, key, true);
    prev[key] = classValue;
  }
  return prev;
}
const VIRTUALIZE_BYTES = 500_000;
const codeMetrics = {
  ...DEFAULT_VIRTUAL_FILE_METRICS,
  lineHeight: 24,
  fileGap: 0
};
const sharedKeys = ["mode", "media", "class", "classList", "annotations", "selectedLines", "commentedLines", "search", "onLineSelected", "onLineSelectionEnd", "onLineNumberSelectionEnd", "onRendered", "preloadedDiff"];
const textKeys = ["file", ...sharedKeys];
const diffKeys = ["fileDiff", "before", "after", ...sharedKeys];

// ---------------------------------------------------------------------------
// Shared viewer hook
// ---------------------------------------------------------------------------

function useFileViewer(config) {
  let wrapper;
  let container;
  let overlay;
  let selectionFrame;
  let dragFrame;
  let dragStart;
  let dragEnd;
  let dragMoved = false;
  let lastSelection = null;
  let pendingSelectionEnd = false;
  const ready = createReadyWatcher();
  const bridge = createLineNumberSelectionBridge();
  const [rendered, setRendered] = createSignal(0);
  const getRoot = () => getViewerRoot(container);
  const getHost = () => getViewerHost(container);
  const find = createFileFind({
    wrapper: () => wrapper,
    overlay: () => overlay,
    getRoot
  });

  // -- selection scheduling --

  const scheduleSelectionUpdate = () => {
    if (selectionFrame !== undefined) return;
    selectionFrame = requestAnimationFrame(() => {
      selectionFrame = undefined;
      const finishing = pendingSelectionEnd;
      config.updateSelection(finishing);
      if (!pendingSelectionEnd) return;
      pendingSelectionEnd = false;
      config.onLineSelectionEnd(lastSelection);
    });
  };
  const scheduleDragUpdate = () => {
    if (dragFrame !== undefined) return;
    dragFrame = requestAnimationFrame(() => {
      dragFrame = undefined;
      const selected = config.buildDragSelection();
      if (selected) config.setSelectedLines(selected);
    });
  };

  // -- mouse handlers --

  const handleMouseDown = event => {
    if (!config.enableLineSelection()) return;
    if (event.button !== 0) return;
    const hit = config.lineFromMouseEvent(event);
    if (hit.numberColumn) {
      bridge.begin(true, hit.line);
      return;
    }
    if (hit.line === undefined) return;
    bridge.begin(false, hit.line);
    dragStart = hit.line;
    dragEnd = hit.line;
    dragMoved = false;
    config.onDragStart(hit);
  };
  const handleMouseMove = event => {
    if (!config.enableLineSelection()) return;
    const hit = config.lineFromMouseEvent(event);
    if (bridge.track(event.buttons, hit.line)) return;
    if (dragStart === undefined) return;
    if ((event.buttons & 1) === 0) {
      dragStart = undefined;
      dragEnd = undefined;
      dragMoved = false;
      config.onDragReset();
      bridge.finish();
      return;
    }
    if (hit.line === undefined) return;
    dragEnd = hit.line;
    dragMoved = true;
    config.onDragMove(hit);
    scheduleDragUpdate();
  };
  const handleMouseUp = () => {
    if (!config.enableLineSelection()) return;
    if (bridge.finish() === "numbers") return;
    if (dragStart === undefined) return;
    if (!dragMoved) {
      pendingSelectionEnd = false;
      const selected = config.buildClickSelection();
      if (selected) config.setSelectedLines(selected);
      config.onLineSelectionEnd(lastSelection);
      dragStart = undefined;
      dragEnd = undefined;
      dragMoved = false;
      config.onDragReset();
      return;
    }
    pendingSelectionEnd = true;
    scheduleDragUpdate();
    scheduleSelectionUpdate();
    dragStart = undefined;
    dragEnd = undefined;
    dragMoved = false;
    config.onDragReset();
  };
  const handleSelectionChange = () => {
    if (!config.enableLineSelection()) return;
    if (dragStart === undefined) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    scheduleSelectionUpdate();
  };

  // -- shared effects --

  onMount(() => {
    onCleanup(observeViewerScheme(getHost));
  });
  createEffect(() => {
    rendered();
    const ranges = config.commentedLines();
    requestAnimationFrame(() => {
      const root = getRoot();
      if (!root) return;
      config.markCommented(root, ranges);
    });
  });
  createEffect(() => {
    config.setSelectedLines(config.selectedLines() ?? null);
  });
  createEffect(() => {
    if (!config.enableLineSelection()) return;
    makeEventListener(container, "mousedown", handleMouseDown);
    makeEventListener(container, "mousemove", handleMouseMove);
    makeEventListener(window, "mouseup", handleMouseUp);
    makeEventListener(document, "selectionchange", handleSelectionChange);
  });
  onCleanup(() => {
    clearReadyWatcher(ready);
    if (selectionFrame !== undefined) cancelAnimationFrame(selectionFrame);
    if (dragFrame !== undefined) cancelAnimationFrame(dragFrame);
    selectionFrame = undefined;
    dragFrame = undefined;
    dragStart = undefined;
    dragEnd = undefined;
    dragMoved = false;
    bridge.reset();
    lastSelection = null;
    pendingSelectionEnd = false;
  });
  return {
    get wrapper() {
      return wrapper;
    },
    set wrapper(v) {
      wrapper = v;
    },
    get container() {
      return container;
    },
    set container(v) {
      container = v;
    },
    get overlay() {
      return overlay;
    },
    set overlay(v) {
      overlay = v;
    },
    get dragStart() {
      return dragStart;
    },
    get dragEnd() {
      return dragEnd;
    },
    get lastSelection() {
      return lastSelection;
    },
    set lastSelection(v) {
      lastSelection = v;
    },
    ready,
    bridge,
    rendered,
    setRendered,
    getRoot,
    getHost,
    find,
    scheduleSelectionUpdate
  };
}
function useModeViewer(config, adapter) {
  return useFileViewer({
    enableLineSelection: config.enableLineSelection,
    selectedLines: config.selectedLines,
    commentedLines: () => config.commentedLines() ?? [],
    onLineSelectionEnd: config.onLineSelectionEnd,
    ...adapter
  });
}
function useSearchHandle(opts) {
  createEffect(() => {
    const search = opts.search();
    if (!search) return;
    const handle = {
      focus: () => opts.find.focus()
    };
    search.register(handle);
    onCleanup(() => search.register(null));
  });
}
function createLineCallbacks(opts) {
  const select = range => {
    if (!opts.normalize) return range;
    const next = opts.normalize(range);
    if (next !== undefined) return next;
    return range;
  };
  return {
    onLineSelected: range => {
      const next = select(range);
      opts.viewer.lastSelection = next;
      opts.onLineSelected?.(next);
    },
    onLineSelectionEnd: range => {
      const next = select(range);
      opts.viewer.lastSelection = next;
      opts.onLineSelectionEnd?.(next);
      if (!opts.viewer.bridge.consume(next)) return;
      requestAnimationFrame(() => opts.onLineNumberSelectionEnd?.(next));
    }
  };
}
function useAnnotationRerender(opts) {
  createEffect(() => {
    opts.viewer.rendered();
    const active = opts.current();
    if (!active) return;
    active.setLineAnnotations(opts.annotations());
    active.rerender();
    requestAnimationFrame(() => opts.viewer.find.refresh({
      reset: true
    }));
  });
}
function notifyRendered(opts) {
  notifyShadowReady({
    state: opts.viewer.ready,
    container: opts.viewer.container,
    getRoot: opts.viewer.getRoot,
    isReady: opts.isReady,
    settleFrames: opts.settleFrames,
    onReady: opts.onReady
  });
}
function renderViewer(opts) {
  clearReadyWatcher(opts.viewer.ready);
  opts.current?.cleanUp();
  const next = opts.create();
  opts.assign(next);
  opts.viewer.container.innerHTML = "";
  opts.draw(next);
  applyViewerScheme(opts.viewer.getHost());
  opts.viewer.setRendered(value => value + 1);
  opts.onReady();
}
function preserve(viewer) {
  const root = scrollParent(viewer.wrapper);
  if (!root) return () => {};
  const high = viewer.container.getBoundingClientRect().height;
  if (!high) return () => {};
  const top = viewer.wrapper.getBoundingClientRect().top - root.getBoundingClientRect().top;
  const prev = viewer.container.style.minHeight;
  viewer.container.style.minHeight = `${Math.ceil(high)}px`;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    viewer.container.style.minHeight = prev;
    const next = viewer.wrapper.getBoundingClientRect().top - root.getBoundingClientRect().top;
    const delta = next - top;
    if (delta) root.scrollTop += delta;
  };
}
function scrollParent(el) {
  let parent = el.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    if (style.overflowY === "auto" || style.overflowY === "scroll") return parent;
    parent = parent.parentElement;
  }
}
function createLocalVirtualStrategy(host, enabled) {
  let virtualizer;
  let root;
  const release = () => {
    virtualizer?.cleanUp();
    virtualizer = undefined;
    root = undefined;
  };
  return {
    get: () => {
      if (!enabled()) {
        release();
        return;
      }
      if (typeof document === "undefined") return;
      const wrapper = host();
      if (!wrapper) return;
      const next = scrollParent(wrapper) ?? document;
      if (virtualizer && root === next) return virtualizer;
      release();
      virtualizer = new Virtualizer();
      root = next;
      virtualizer.setup(next, next instanceof Document ? undefined : wrapper);
      return virtualizer;
    },
    cleanup: release
  };
}
function createSharedVirtualStrategy(host) {
  let shared;
  const release = () => {
    shared?.release();
    shared = undefined;
  };
  return {
    get: () => {
      if (shared) return shared.virtualizer;
      const container = host();
      if (!container) return;
      const result = acquireVirtualizer(container);
      if (!result) return;
      shared = result;
      return result.virtualizer;
    },
    cleanup: release
  };
}
function parseLine(node) {
  if (!node.dataset.line) return;
  const value = parseInt(node.dataset.line, 10);
  if (Number.isNaN(value)) return;
  return value;
}
function mouseHit(event, line, side) {
  const path = event.composedPath();
  let numberColumn = false;
  let value;
  let branch;
  for (const item of path) {
    if (!(item instanceof HTMLElement)) continue;
    numberColumn = numberColumn || item.dataset.columnNumber != null;
    if (value === undefined) value = line(item);
    if (branch === undefined && side) branch = side(item);
    if (numberColumn && value !== undefined && (side == null || branch !== undefined)) break;
  }
  return {
    line: value,
    numberColumn,
    side: branch
  };
}
function diffMouseSide(node) {
  const type = node.dataset.lineType;
  if (type === "change-deletion") return "deletions";
  if (type === "change-addition" || type === "change-additions") return "additions";
  if (node.dataset.code == null) return;
  return node.hasAttribute("data-deletions") ? "deletions" : "additions";
}
function diffSelectionSide(node) {
  const el = findElement(node);
  if (!el) return;
  return findDiffSide(el);
}

// ---------------------------------------------------------------------------
// Shared JSX shell
// ---------------------------------------------------------------------------

function ViewerShell(props) {
  const el = template(`<div data-component="file" class="relative outline-none" tabindex="0"><div></div><div class="pointer-events-none absolute inset-0 z-0"></div></div>`);
  const container = el.firstChild;
  const overlay = container.nextSibling;
  el.addEventListener("focus", props.viewer.find.onFocus);
  // The compiled output registered onPointerDown as a *delegated* pointerdown
  // ($$pointerdown + delegateEvents). A native listener is equivalent here:
  // pointerdown is composed, so events from inside the viewer shadow root
  // still bubble to this wrapper, while events inside the portal-mounted
  // search bar never reach it natively — the same outcome the bar's own
  // delegated stopPropagation produced (see file-search.js), and the handler
  // never reads the event object.
  el.addEventListener("pointerdown", props.viewer.find.onPointerDown);
  props.viewer.wrapper = el;
  // Presence-gated search bar: Show + Portal-backed FileSearchBar placed
  // before the container element. insert() keeps when() live and rebuilds
  // the bar once per truthiness flip, as compiled.
  insert(el, createComponent(Show, {
    get when() {
      return props.viewer.find.open();
    },
    get children() {
      return createComponent(FileSearchBar, {
        get pos() {
          return props.viewer.find.pos;
        },
        get query() {
          return props.viewer.find.query;
        },
        get count() {
          return props.viewer.find.count;
        },
        get index() {
          return props.viewer.find.index;
        },
        get setInput() {
          return props.viewer.find.setInput;
        },
        get onInput() {
          return props.viewer.find.setQuery;
        },
        get onKeyDown() {
          return props.viewer.find.onInputKeyDown;
        },
        get onClose() {
          return props.viewer.find.close;
        },
        onPrev: () => props.viewer.find.next(-1),
        onNext: () => props.viewer.find.next(1)
      });
    }
  }), container);
  props.viewer.container = container;
  props.viewer.overlay = overlay;
  // styleVariables is a module-level constant object, so the compiled style()
  // diff only ever applied it once; a one-shot application is equivalent.
  for (const [name, value] of Object.entries(styleVariables)) {
    el.style.setProperty(name, String(value));
  }
  // Change-guarded data-mode + classList, mirroring the compiled effect block
  // (setAttribute semantics: nullish removes the attribute).
  let prevMode;
  const prevClasses = {};
  createRenderEffect(() => {
    const mode = props.mode;
    const classes = {
      ...props.classList,
      [props.class ?? ""]: !!props.class
    };
    if (mode !== prevMode) {
      prevMode = mode;
      if (mode == null) el.removeAttribute("data-mode");
      else el.setAttribute("data-mode", mode);
    }
    applyClassList(el, classes, prevClasses);
  });
  return el;
}

// ---------------------------------------------------------------------------
// TextViewer
// ---------------------------------------------------------------------------

function TextViewer(props) {
  let instance;
  let viewer;
  const [local, others] = splitProps(props, textKeys);
  const text = () => {
    const value = local.file.contents;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.join("\n");
    if (value == null) return "";
    // oxlint-disable-next-line no-base-to-string -- file contents cast to unknown, coercion is intentional
    return String(value);
  };
  const lineCount = () => {
    const value = text();
    const total = value.split("\n").length - (value.endsWith("\n") ? 1 : 0);
    return Math.max(1, total);
  };
  const bytes = createMemo(() => {
    const value = local.file.contents;
    if (typeof value === "string") return value.length;
    if (Array.isArray(value)) {
      return value.reduce(
      // oxlint-disable-next-line no-base-to-string -- array parts coerced intentionally
      (sum, part) => sum + (typeof part === "string" ? part.length + 1 : String(part).length + 1), 0);
    }
    if (value == null) return 0;
    // oxlint-disable-next-line no-base-to-string -- file contents cast to unknown, coercion is intentional
    return String(value).length;
  });
  const virtual = createMemo(() => bytes() > VIRTUALIZE_BYTES);
  const virtuals = createLocalVirtualStrategy(() => viewer.wrapper, virtual);
  const lineFromMouseEvent = event => mouseHit(event, parseLine);
  const applySelection = range => {
    const current = instance;
    if (!current) return false;
    if (virtual()) {
      current.setSelectedLines(range);
      return true;
    }
    const root = viewer.getRoot();
    if (!root) return false;
    const total = lineCount();
    if (root.querySelectorAll("[data-line]").length < total) return false;
    if (!range) {
      current.setSelectedLines(null);
      return true;
    }
    const start = Math.min(range.start, range.end);
    const end = Math.max(range.start, range.end);
    if (start < 1 || end > total) {
      current.setSelectedLines(null);
      return true;
    }
    if (!root.querySelector(`[data-line="${start}"]`) || !root.querySelector(`[data-line="${end}"]`)) {
      current.setSelectedLines(null);
      return true;
    }
    const normalized = (() => {
      if (range.endSide != null) return {
        start: range.start,
        end: range.end
      };
      if (range.side !== "deletions") return range;
      if (root.querySelector("[data-deletions]") != null) return range;
      return {
        start: range.start,
        end: range.end
      };
    })();
    current.setSelectedLines(normalized);
    return true;
  };
  const setSelectedLines = range => {
    viewer.lastSelection = range;
    applySelection(range);
  };
  const adapter = {
    lineFromMouseEvent,
    setSelectedLines,
    updateSelection: preserveTextSelection => {
      const root = viewer.getRoot();
      if (!root) return;
      const selected = readShadowLineSelection({
        root,
        lineForNode: findFileLineNumber,
        sideForNode: findCodeSelectionSide,
        preserveTextSelection
      });
      if (!selected) return;
      setSelectedLines(selected.range);
      if (!preserveTextSelection || !selected.text) return;
      restoreShadowTextSelection(root, selected.text);
    },
    buildDragSelection: () => {
      if (viewer.dragStart === undefined || viewer.dragEnd === undefined) return;
      return {
        start: Math.min(viewer.dragStart, viewer.dragEnd),
        end: Math.max(viewer.dragStart, viewer.dragEnd)
      };
    },
    buildClickSelection: () => {
      if (viewer.dragStart === undefined) return;
      return {
        start: viewer.dragStart,
        end: viewer.dragStart
      };
    },
    onDragStart: () => {},
    onDragMove: () => {},
    onDragReset: () => {},
    markCommented: markCommentedFileLines
  };
  viewer = useModeViewer({
    enableLineSelection: () => props.enableLineSelection === true,
    selectedLines: () => local.selectedLines,
    commentedLines: () => local.commentedLines,
    onLineSelectionEnd: range => local.onLineSelectionEnd?.(range)
  }, adapter);
  const lineCallbacks = createLineCallbacks({
    viewer,
    onLineSelected: range => local.onLineSelected?.(range),
    onLineSelectionEnd: range => local.onLineSelectionEnd?.(range),
    onLineNumberSelectionEnd: range => local.onLineNumberSelectionEnd?.(range)
  });
  const options = createMemo(() => ({
    ...createDefaultOptions("unified"),
    ...others,
    ...lineCallbacks
  }));
  const notify = () => {
    notifyRendered({
      viewer,
      isReady: root => {
        if (virtual()) return root.querySelector("[data-line]") != null;
        return root.querySelectorAll("[data-line]").length >= lineCount();
      },
      onReady: () => {
        applySelection(viewer.lastSelection);
        viewer.find.refresh({
          reset: true
        });
        local.onRendered?.();
      }
    });
  };
  useSearchHandle({
    search: () => local.search,
    find: viewer.find
  });

  // -- render instance --

  createEffect(() => {
    const opts = options();
    const workerPool = getWorkerPool("unified");
    const isVirtual = virtual();
    const virtualizer = virtuals.get();
    renderViewer({
      viewer,
      current: instance,
      create: () => isVirtual && virtualizer ? new VirtualizedFile(opts, virtualizer, codeMetrics, workerPool) : new PierreFile(opts, workerPool),
      assign: value => {
        instance = value;
      },
      draw: value => {
        const contents = text();
        value.render({
          file: typeof local.file.contents === "string" ? local.file : {
            ...local.file,
            contents
          },
          lineAnnotations: [],
          containerWrapper: viewer.container
        });
      },
      onReady: notify
    });
  });
  useAnnotationRerender({
    viewer,
    current: () => instance,
    annotations: () => local.annotations ?? []
  });

  // -- cleanup --

  onCleanup(() => {
    instance?.cleanUp();
    instance = undefined;
    virtuals.cleanup();
  });
  return createComponent(ViewerShell, {
    mode: "text",
    viewer: viewer,
    get ["class"]() {
      return local.class;
    },
    get classList() {
      return local.classList;
    }
  });
}

// ---------------------------------------------------------------------------
// DiffViewer
// ---------------------------------------------------------------------------

function DiffViewer(props) {
  let instance;
  let dragSide;
  let dragEndSide;
  let viewer;
  const [local, others] = splitProps(props, diffKeys);
  const mobile = createMediaQuery("(max-width: 640px)");
  const lineFromMouseEvent = event => mouseHit(event, findDiffLineNumber, diffMouseSide);
  const setSelectedLines = (range, preserve) => {
    const active = instance;
    if (!active) return;
    const fixed = fixDiffSelection(viewer.getRoot(), range);
    if (fixed === undefined) {
      viewer.lastSelection = range;
      return;
    }
    viewer.lastSelection = fixed;
    active.setSelectedLines(fixed);
    restoreShadowTextSelection(preserve?.root, preserve?.text);
  };
  const adapter = {
    lineFromMouseEvent,
    setSelectedLines,
    updateSelection: preserveTextSelection => {
      const root = viewer.getRoot();
      if (!root) return;
      const selected = readShadowLineSelection({
        root,
        lineForNode: findDiffLineNumber,
        sideForNode: diffSelectionSide,
        preserveTextSelection
      });
      if (!selected) return;
      if (selected.text) {
        setSelectedLines(selected.range, {
          root,
          text: selected.text
        });
        return;
      }
      setSelectedLines(selected.range);
    },
    buildDragSelection: () => {
      if (viewer.dragStart === undefined || viewer.dragEnd === undefined) return;
      const selected = {
        start: viewer.dragStart,
        end: viewer.dragEnd
      };
      if (dragSide) selected.side = dragSide;
      if (dragEndSide && dragSide && dragEndSide !== dragSide) selected.endSide = dragEndSide;
      return selected;
    },
    buildClickSelection: () => {
      if (viewer.dragStart === undefined) return;
      const selected = {
        start: viewer.dragStart,
        end: viewer.dragStart
      };
      if (dragSide) selected.side = dragSide;
      return selected;
    },
    onDragStart: hit => {
      dragSide = hit.side;
      dragEndSide = hit.side;
    },
    onDragMove: hit => {
      dragEndSide = hit.side;
    },
    onDragReset: () => {
      dragSide = undefined;
      dragEndSide = undefined;
    },
    markCommented: markCommentedDiffLines
  };
  viewer = useModeViewer({
    enableLineSelection: () => props.enableLineSelection === true,
    selectedLines: () => local.selectedLines,
    commentedLines: () => local.commentedLines,
    onLineSelectionEnd: range => local.onLineSelectionEnd?.(range)
  }, adapter);
  const virtuals = createSharedVirtualStrategy(() => viewer.container);
  const large = createMemo(() => {
    if (local.fileDiff) {
      const before = local.fileDiff.deletionLines.join("");
      const after = local.fileDiff.additionLines.join("");
      return Math.max(before.length, after.length) > 500_000;
    }
    const before = typeof local.before?.contents === "string" ? local.before.contents : "";
    const after = typeof local.after?.contents === "string" ? local.after.contents : "";
    return Math.max(before.length, after.length) > 500_000;
  });
  const largeOptions = {
    lineDiffType: "none",
    maxLineDiffLength: 0,
    tokenizeMaxLineLength: 1
  };
  const lineCallbacks = createLineCallbacks({
    viewer,
    normalize: range => fixDiffSelection(viewer.getRoot(), range),
    onLineSelected: range => local.onLineSelected?.(range),
    onLineSelectionEnd: range => local.onLineSelectionEnd?.(range),
    onLineNumberSelectionEnd: range => local.onLineNumberSelectionEnd?.(range)
  });
  const options = createMemo(() => {
    const base = {
      ...createDefaultOptions(props.diffStyle),
      ...others,
      ...lineCallbacks
    };
    const perf = large() ? {
      ...base,
      ...largeOptions
    } : base;
    if (!mobile()) return perf;
    return {
      ...perf,
      disableLineNumbers: true
    };
  });
  const notify = done => {
    notifyRendered({
      viewer,
      isReady: root => root.querySelector("[data-line]") != null,
      settleFrames: 1,
      onReady: () => {
        done?.();
        setSelectedLines(viewer.lastSelection);
        viewer.find.refresh({
          reset: true
        });
        local.onRendered?.();
      }
    });
  };
  useSearchHandle({
    search: () => local.search,
    find: viewer.find
  });

  // -- render instance --

  createEffect(() => {
    const opts = options();
    const workerPool = large() ? getWorkerPool("unified") : getWorkerPool(props.diffStyle);
    const virtualizer = virtuals.get();
    const beforeContents = typeof local.before?.contents === "string" ? local.before.contents : "";
    const afterContents = typeof local.after?.contents === "string" ? local.after.contents : "";
    const done = preserve(viewer);
    onCleanup(done);
    const cacheKey = contents => {
      if (!large()) return sampledChecksum(contents, contents.length);
      return sampledChecksum(contents);
    };
    renderViewer({
      viewer,
      current: instance,
      create: () => virtualizer ? new VirtualizedFileDiff(opts, virtualizer, virtualMetrics, workerPool) : new FileDiff(opts, workerPool),
      assign: value => {
        instance = value;
      },
      draw: value => {
        if (local.fileDiff) {
          value.render({
            fileDiff: local.fileDiff,
            lineAnnotations: [],
            containerWrapper: viewer.container
          });
          return;
        }
        if (!local.before || !local.after) return;
        value.render({
          oldFile: {
            ...local.before,
            contents: beforeContents,
            cacheKey: cacheKey(beforeContents)
          },
          newFile: {
            ...local.after,
            contents: afterContents,
            cacheKey: cacheKey(afterContents)
          },
          lineAnnotations: [],
          containerWrapper: viewer.container
        });
      },
      onReady: () => notify(done)
    });
  });
  useAnnotationRerender({
    viewer,
    current: () => instance,
    annotations: () => local.annotations ?? []
  });

  // -- cleanup --

  onCleanup(() => {
    instance?.cleanUp();
    instance = undefined;
    virtuals.cleanup();
    dragSide = undefined;
    dragEndSide = undefined;
  });
  return createComponent(ViewerShell, {
    mode: "diff",
    viewer: viewer,
    get ["class"]() {
      return local.class;
    },
    get classList() {
      return local.classList;
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function File(props) {
  if (props.mode === "text") {
    return createComponent(FileMedia, {
      get media() {
        return props.media;
      },
      fallback: () => TextViewer(props)
    });
  }
  return createComponent(FileMedia, {
    get media() {
      return props.media;
    },
    fallback: () => DiffViewer(props)
  });
}