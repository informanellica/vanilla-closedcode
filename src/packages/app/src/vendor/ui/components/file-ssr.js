/** @file Server-side-rendered/hydratable diff viewer (FileSSR / DiffSSRViewer) backed by a preloaded, prerendered diff. */
import { DIFFS_TAG_NAME, FileDiff, VirtualizedFileDiff } from "@pierre/diffs";
import { createComponent, createEffect, createRenderEffect, onCleanup, onMount, Show, splitProps } from "../../../lib/reactivity.js";
import { Dynamic, isServer } from "../../../lib/reactivity.js";
import { useWorkerPool } from "../context/worker-pool.js";
import { createDefaultOptions, styleVariables } from "../pierre/index.js";
import { markCommentedDiffLines } from "../pierre/commented-lines.js";
import { fixDiffSelection } from "../pierre/diff-selection.js";
import { applyViewerScheme, clearReadyWatcher, createReadyWatcher, notifyShadowReady, observeViewerScheme } from "../pierre/file-runtime.js";
import { acquireVirtualizer, virtualMetrics } from "../pierre/virtualizer.js";
import { File } from "./file.js";

// Apply a Solid classList object to a real element with prev-diffing, matching
// solid-js/web classList(node, value, prev): tokens that disappear between
// runs are removed; truthy tokens added, falsy removed. Returns the value so
// it can be carried as the next prev.
/**
 * Apply a Solid classList object to an element, diffing against the previous value.
 * @param {Element} el - The target element.
 * @param {Object} value - Map of space-separated class-token strings to truthy/falsy flags.
 * @param {Object} prev - The previously applied classList map (used to remove dropped tokens).
 * @returns {Object} The applied value, to carry as the next prev.
 */
function applyClassList(el, value, prev) {
  const next = value || {};
  const previous = prev || {};
  const addToken = cls => {
    if (!cls) return;
    const tokens = cls.split(/\s+/).filter(Boolean);
    if (tokens.length) el.classList.add(...tokens);
  };
  const removeToken = cls => {
    if (!cls) return;
    const tokens = cls.split(/\s+/).filter(Boolean);
    if (tokens.length) el.classList.remove(...tokens);
  };
  // Remove classes that were on previously but are gone now.
  for (const cls in previous) {
    if (cls && !next[cls] && previous[cls]) removeToken(cls);
  }
  // Add/remove based on the current value when it differs from prev.
  for (const cls in next) {
    const on = !!next[cls];
    if (on === !!previous[cls]) continue;
    if (on) addToken(cls);
    else removeToken(cls);
  }
  return next;
}

// Apply a Solid style object to a real element. styleVariables is a stable
// module constant, so this mirrors solid-js/web style(node, value, prev):
// numbers/strings flow through setProperty (coerced to string), and the prev
// reference guard keeps the work to the first run.
/**
 * Apply a Solid style object to an element, removing dropped keys and setting changed ones.
 * @param {Element} el - The target element.
 * @param {Object} value - Map of CSS property names to values.
 * @param {Object} prev - The previously applied style object (reference-guarded).
 * @returns {Object} The applied value, to carry as the next prev.
 */
function applyStyle(el, value, prev) {
  if (value === prev) return prev;
  if (prev) {
    for (const key in prev) {
      if (value == null || !(key in value)) el.style.removeProperty(key);
    }
  }
  if (value) {
    for (const key in value) {
      el.style.setProperty(key, value[key]);
    }
  }
  return value;
}

/**
 * SSR/hydration diff viewer: renders a static skeleton plus a declarative shadow-root seeded
 * with prerendered HTML on the server, then on mount instantiates the @pierre/diffs FileDiff
 * (or VirtualizedFileDiff) and hydrates it, wiring selection, annotations and commented lines.
 * @param {Object} props - Component props.
 * @param {string} props.mode - Viewer mode (this viewer handles "diff").
 * @param {*} props.media - Media descriptor (binary/image), forwarded.
 * @param {Object} props.fileDiff - Precomputed file diff to hydrate from, when provided.
 * @param {Object} props.before - The old file ({ name, contents }) when fileDiff is absent.
 * @param {Object} props.after - The new file ({ name, contents }) when fileDiff is absent.
 * @param {string} props.class - Class string applied to the root container.
 * @param {Object} props.classList - Solid-style classList map applied to the root container.
 * @param {Array} props.annotations - Line annotations to render.
 * @param {Object} props.selectedLines - Currently selected line range.
 * @param {Array} props.commentedLines - Line ranges to mark as commented.
 * @param {Function} props.onLineSelected - Callback for an in-progress line selection.
 * @param {Function} props.onLineSelectionEnd - Callback when a line selection ends.
 * @param {Function} props.onLineNumberSelectionEnd - Callback when a line-number selection ends.
 * @param {Function} props.onRendered - Callback fired once the diff has settled/rendered.
 * @param {Object} props.preloadedDiff - Preloaded diff data ({ options, annotations, prerenderedHTML }).
 * @param {string} props.diffStyle - Diff style key (e.g. "unified"/"split") for default options and worker pool.
 * @returns {HTMLElement} The root container element.
 */
function DiffSSRViewer(props) {
  let container;
  let fileDiffRef;
  let fileDiffInstance;
  let sharedVirtualizer;
  const ready = createReadyWatcher();
  const workerPool = useWorkerPool(props.diffStyle);
  const [local, others] = splitProps(props, ["mode", "media", "fileDiff", "before", "after", "class", "classList", "annotations", "selectedLines", "commentedLines", "onLineSelected", "onLineSelectionEnd", "onLineNumberSelectionEnd", "onRendered", "preloadedDiff"]);
  const getRoot = () => fileDiffRef?.shadowRoot ?? undefined;
  const getVirtualizer = () => {
    if (sharedVirtualizer) return sharedVirtualizer.virtualizer;
    const result = acquireVirtualizer(container);
    if (!result) return;
    sharedVirtualizer = result;
    return result.virtualizer;
  };
  const setSelectedLines = (range, attempt = 0) => {
    const diff = fileDiffInstance;
    if (!diff) return;
    const fixed = fixDiffSelection(getRoot(), range ?? null);
    if (fixed === undefined) {
      if (attempt >= 120) return;
      requestAnimationFrame(() => setSelectedLines(range ?? null, attempt + 1));
      return;
    }
    diff.setSelectedLines(fixed);
  };
  const notifyRendered = () => {
    notifyShadowReady({
      state: ready,
      container,
      getRoot,
      isReady: root => root.querySelector("[data-line]") != null,
      settleFrames: 1,
      onReady: () => {
        setSelectedLines(local.selectedLines ?? null);
        local.onRendered?.();
      }
    });
  };
  onMount(() => {
    if (isServer) return;
    onCleanup(observeViewerScheme(() => fileDiffRef));
    const virtualizer = getVirtualizer();
    const annotations = local.annotations ?? local.preloadedDiff.annotations ?? [];
    fileDiffInstance = virtualizer ? new VirtualizedFileDiff({
      ...createDefaultOptions(props.diffStyle),
      ...others,
      ...local.preloadedDiff.options
    }, virtualizer, virtualMetrics, workerPool) : new FileDiff({
      ...createDefaultOptions(props.diffStyle),
      ...others,
      ...local.preloadedDiff.options
    }, workerPool);
    applyViewerScheme(fileDiffRef);

    // private field required for hydration
    fileDiffInstance.fileContainer = fileDiffRef;
    fileDiffInstance.hydrate(local.fileDiff ? {
      fileDiff: local.fileDiff,
      lineAnnotations: annotations,
      fileContainer: fileDiffRef,
      containerWrapper: container,
      prerenderedHTML: local.preloadedDiff.prerenderedHTML
    } : {
      oldFile: local.before,
      newFile: local.after,
      lineAnnotations: annotations,
      fileContainer: fileDiffRef,
      containerWrapper: container,
      prerenderedHTML: local.preloadedDiff.prerenderedHTML
    });
    notifyRendered();
  });
  createEffect(() => {
    const diff = fileDiffInstance;
    if (!diff) return;
    diff.setLineAnnotations(local.annotations ?? []);
    diff.rerender();
  });
  createEffect(() => {
    setSelectedLines(local.selectedLines ?? null);
  });
  createEffect(() => {
    const ranges = local.commentedLines ?? [];
    requestAnimationFrame(() => {
      const root = getRoot();
      if (!root) return;
      markCommentedDiffLines(root, ranges);
    });
  });
  onCleanup(() => {
    clearReadyWatcher(ready);
    fileDiffInstance?.cleanUp();
    sharedVirtualizer?.release();
    sharedVirtualizer = undefined;
  });

  // Static skeleton: <div data-component=file data-mode=diff>. This element is
  // the `container` ref.
  const root = document.createElement("div");
  root.setAttribute("data-component", "file");
  root.setAttribute("data-mode", "diff");
  container = root;

  // The diff custom element. Dynamic (a public solid-js/web component, not a
  // compiled primitive) creates <DIFFS_TAG_NAME> and forwards the ref to the
  // actual element so hydration can attach to it. Its child is a server-only
  // declarative shadow-root <template> seeded with the prerendered HTML.
  const diffEl = createComponent(Dynamic, {
    component: DIFFS_TAG_NAME,
    ref(r$) {
      fileDiffRef = r$;
    },
    id: "ssr-diff",
    get children() {
      return createComponent(Show, {
        when: isServer,
        get children() {
          // <template shadowrootmode=open> with reactive innerHTML, as compiled.
          const tpl = document.createElement("template");
          tpl.setAttribute("shadowrootmode", "open");
          createRenderEffect(() => {
            tpl.innerHTML = local.preloadedDiff.prerenderedHTML;
          });
          return tpl;
        }
      });
    }
  });
  // Insert the Dynamic result. It may be a Node or an accessor (Dynamic returns
  // a memo accessor when the component string changes); resolve once like
  // solid's insert would for a stable component value.
  root.append(typeof diffEl === "function" ? diffEl() : diffEl);

  // Static style object + change-guarded className + diffed classList, matching
  // the compiled effect().
  let prevStyle;
  let prevClass;
  let prevClassList;
  createRenderEffect(() => {
    prevStyle = applyStyle(root, styleVariables, prevStyle);
    const nextClass = local.class;
    if (nextClass !== prevClass) {
      prevClass = nextClass;
      // className mirrors solid-js/web: nullish removes the class attribute.
      if (nextClass == null) root.removeAttribute("class");
      else root.className = nextClass;
    }
    prevClassList = applyClassList(root, local.classList, prevClassList);
  });
  return root;
}
/**
 * SSR-aware file viewer entry: uses the hydratable diff viewer when in diff mode with a
 * preloaded diff, and otherwise falls back to the regular client File viewer.
 * @param {Object} props - Component props (see DiffSSRViewer and File).
 * @param {string} props.mode - Viewer mode; "diff" with preloadedDiff routes to the SSR viewer.
 * @param {Object} props.preloadedDiff - Preloaded prerendered diff data, required for the SSR path.
 * @returns {Node} The SSR diff viewer element, or the File component's output.
 */
export function FileSSR(props) {
  if (props.mode !== "diff" || !props.preloadedDiff) return File(props);
  return DiffSSRViewer(props);
}
