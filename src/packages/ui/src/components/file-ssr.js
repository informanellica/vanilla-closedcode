import { template as _$template } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { className as _$className } from "solid-js/web";
import { style as _$style } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { use as _$use } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<template shadowrootmode=open>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-component=file data-mode=diff>`);
import { DIFFS_TAG_NAME, FileDiff, VirtualizedFileDiff } from "@pierre/diffs";
import { createEffect, onCleanup, onMount, Show, splitProps } from "solid-js";
import { Dynamic, isServer } from "solid-js/web";
import { useWorkerPool } from "../context/worker-pool.js";
import { createDefaultOptions, styleVariables } from "../pierre/index.js";
import { markCommentedDiffLines } from "../pierre/commented-lines.js";
import { fixDiffSelection } from "../pierre/diff-selection.js";
import { applyViewerScheme, clearReadyWatcher, createReadyWatcher, notifyShadowReady, observeViewerScheme } from "../pierre/file-runtime.js";
import { acquireVirtualizer, virtualMetrics } from "../pierre/virtualizer.js";
import { File } from "./file.js";
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
  return (() => {
    var _el$ = _tmpl$2();
    var _ref$ = container;
    typeof _ref$ === "function" ? _$use(_ref$, _el$) : container = _el$;
    _$insert(_el$, _$createComponent(Dynamic, {
      component: DIFFS_TAG_NAME,
      ref(r$) {
        var _ref$2 = fileDiffRef;
        typeof _ref$2 === "function" ? _ref$2(r$) : fileDiffRef = r$;
      },
      id: "ssr-diff",
      get children() {
        return _$createComponent(Show, {
          when: isServer,
          get children() {
            var _el$2 = _tmpl$();
            _$effect(() => _el$2.innerHTML = local.preloadedDiff.prerenderedHTML);
            return _el$2;
          }
        });
      }
    }));
    _$effect(_p$ => {
      var _v$ = styleVariables,
        _v$2 = local.class,
        _v$3 = local.classList;
      _p$.e = _$style(_el$, _v$, _p$.e);
      _v$2 !== _p$.t && _$className(_el$, _p$.t = _v$2);
      _p$.a = _$classList(_el$, _v$3, _p$.a);
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$;
  })();
}
export function FileSSR(props) {
  if (props.mode !== "diff" || !props.preloadedDiff) return File(props);
  return DiffSSRViewer(props);
}