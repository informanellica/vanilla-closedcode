import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { setStyleProperty as _$setStyleProperty } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div class="h-100 d-flex flex-column"><div class="h-6 shrink-0"aria-hidden></div><div class="flex-1 pb-64 d-flex align-items-center justify-content-center text-center"><div class="small fw-normal text-secondary">`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="px-2 py-2 small fw-normal text-secondary">`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div id=file-tree-panel class="relative min-w-0 h-100 shrink-0 overflow-hidden border-r border"><div class="h-100 d-flex flex-column overflow-hidden">`),
  _tmplClose = /*#__PURE__*/_$template(`<button type=button class="btn btn-link btn-sm p-0 px-1 position-absolute text-secondary text-decoration-none bg-body-tertiary rounded" style="top:3px;right:5px;z-index:6;line-height:1" title="左サイドバーを隠す" aria-label="左サイドバーを隠す"><i class="bi bi-x-lg"></i></button>`);
import { Match, Show, Switch, createMemo } from "solid-js";
import { useParams } from "@solidjs/router";
import { base64Decode } from "core/util/encode";
import { createMediaQuery } from "@solid-primitives/media";
import { ResizeHandle } from "@/vendor/ui/components/resize-handle.js";
import FileTree from "@/components/file-tree.js";
import { env } from "@/lib/env.js";
import { useFile } from "@/context/file.js";
import { useLanguage } from "@/context/language.js";
import { useLayout } from "@/context/layout.js";
import { usePlatform } from "@/context/platform.js";
import { useSettings } from "@/context/settings.js";

/**
 * Standalone left-pane file tree panel.
 *
 * Props:
 *   diffs          — reactive accessor returning diff array
 *   diffsReady     — reactive accessor, true when diff data has loaded
 *   hasReview      — reactive accessor, true when there are changed files
 *   reviewCount    — reactive accessor returning number of changed files
 *   activeDiff     — currently focused diff path (string | undefined)
 *   onChangedFileClick(path)  — callback for clicking a file in the changes tab
 *   onFileClick(path)         — callback for clicking a file in the all tab
 *   size           — { active(), start(), touch() } from createSizing
 */
export function FileTreePane(props) {
  const layout = useLayout();
  const platform = usePlatform();
  const settings = useSettings();
  const file = useFile();
  const language = useLanguage();
  const isDesktop = createMediaQuery("(min-width: 768px)");

  const shown = createMemo(() =>
    platform.platform !== "desktop" ||
    env("VITE_CLOSEDCODE_CHANNEL") !== "beta" ||
    settings.general.showFileTree()
  );
  const fileOpen = createMemo(() => isDesktop() && shown() && layout.fileTree.opened());
  const treeWidth = createMemo(() => fileOpen() ? `${layout.fileTree.width()}px` : "0px");

  const diffFiles = createMemo(() => props.diffs().map(d => d.file));
  const kinds = createMemo(() => {
    const merge = (a, b) => {
      if (!a) return b;
      if (a === b) return a;
      return "mix";
    };
    // "\\\\" only matched doubled backslashes; single "\\" (the actual Windows
    // separator) slipped through and broke key matching against node paths.
    const normalize = p => p.replaceAll("\\", "/").replace(/\/+$/, "");
    const out = new Map();
    for (const diff of props.diffs()) {
      const f = normalize(diff.file);
      const kind = diff.status === "added" ? "add" : diff.status === "deleted" ? "del" : "mix";
      out.set(f, kind);
      const parts = f.split("/");
      for (const [idx] of parts.slice(0, -1).entries()) {
        const dir = parts.slice(0, idx + 1).join("/");
        if (!dir) continue;
        out.set(dir, merge(out.get(dir), kind));
      }
    }
    return out;
  });

  const nofiles = createMemo(() => {
    const state = file.tree.state("");
    if (!state?.loaded) return false;
    return file.tree.children("").length === 0;
  });

  const empty = msg => (() => {
    var _el$ = _tmpl$(),
      _el$2 = _el$.firstChild,
      _el$3 = _el$2.nextSibling,
      _el$4 = _el$3.firstChild;
    _$insert(_el$4, msg);
    return _el$;
  })();

  return _$createComponent(Show, {
    get when() {
      return isDesktop() && shown();
    },
    get children() {
      var _el$5 = _tmpl$4(),
        _el$6 = _el$5.firstChild;
      var _close = _tmplClose();
      _close.addEventListener("click", () => layout.fileTree.close());
      // Sit inline in the header row (not absolutely positioned) so it lines up
      // vertically with the "すべてのファイル" title.
      _close.className = "btn btn-link btn-sm p-0 px-1 text-secondary text-decoration-none shrink-0";
      _close.style.lineHeight = "1";

      // Single file tree (all files). The former "変更" (git-changed) tab was
      // removed — git changes live in the right-hand panel, so a duplicate
      // filter here is redundant — but the "すべてのファイル" header is kept as
      // the panel title.
      var _header = document.createElement("div");
      _header.className = "shrink-0 d-flex align-items-center justify-content-between px-3 pt-3 pb-1";
      var _title = document.createElement("span");
      _title.className = "small fw-medium text-secondary";
      _$insert(_title, () => language.t("session.files.all"));
      // Show WHICH folder is open: decode the session route's :dir param and
      // append the folder name next to the panel title (full path on hover).
      var _rootName = document.createElement("span");
      _rootName.className = "small fw-normal text-secondary text-truncate ms-1 me-auto";
      const routeParams = useParams();
      const openedDir = () => {
        try {
          return base64Decode(routeParams.dir ?? "");
        } catch {
          return "";
        }
      };
      _$insert(_rootName, () => {
        const dir = openedDir();
        const name = dir ? dir.split(/[\/]/).filter(Boolean).pop() : "";
        return name ? `— ${name}` : "";
      });
      _$effect(() => _rootName.setAttribute("title", openedDir()));
      _$insert(_header, _title);
      _$insert(_header, _rootName);
      _$insert(_header, _close);
      _$insert(_el$6, _header);

      var _body = document.createElement("div");
      _body.className = "flex-1 min-h-0 bg-body px-3 py-0 overflow-y-auto";
      _$insert(_body, _$createComponent(Switch, {
        get children() {
          return [_$createComponent(Match, {
            get when() {
              return nofiles();
            },
            get children() {
              return empty(language.t("session.files.empty"));
            }
          }), _$createComponent(Match, {
            when: true,
            get children() {
              return _$createComponent(FileTree, {
                path: "",
                "class": "pt-3",
                get modified() {
                  return diffFiles();
                },
                get kinds() {
                  return kinds();
                },
                onFileClick: node => props.onFileClick(node.path),
                onContextMenu: (node, e) => props.onContextMenu?.(node, e)
              });
            }
          })];
        }
      }));
      _$insert(_el$6, _body);

      _$insert(_el$5, _$createComponent(Show, {
        get when() {
          return fileOpen();
        },
        get children() {
          var _el$8 = _tmpl$2();
          _el$8.$$pointerdown = () => props.size.start();
          _$insert(_el$8, _$createComponent(ResizeHandle, {
            direction: "horizontal",
            edge: "end",
            get size() {
              return layout.fileTree.width();
            },
            min: 200,
            max: 480,
            onResize: width => {
              props.size.touch();
              layout.fileTree.resize(width);
            }
          }));
          return _el$8;
        }
      }), null);

      _$effect(_p$ => {
        var _v$ = !fileOpen(),
          _v$2 = !fileOpen(),
          _v$3 = {
            "pointer-events-none": !fileOpen(),
            "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none": !props.size.active()
          },
          _v$4 = treeWidth();
        _v$ !== _p$.e && _$setAttribute(_el$5, "aria-hidden", _p$.e = _v$);
        _v$2 !== _p$.t && (_el$5.inert = _p$.t = _v$2);
        _p$.a = _$classList(_el$5, _v$3, _p$.a);
        _v$4 !== _p$.o && _$setStyleProperty(_el$5, "width", _p$.o = _v$4);
        return _p$;
      }, {
        e: undefined,
        t: undefined,
        a: undefined,
        o: undefined
      });

      return _el$5;
    }
  });
}
_$delegateEvents(["pointerdown"]);
