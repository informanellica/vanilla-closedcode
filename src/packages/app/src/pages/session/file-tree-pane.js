import { Show, createComponent, createEffect, createMemo, onCleanup } from "solid-js";
import { useParams } from "@solidjs/router";
import { base64Decode } from "core/util/encode";
import { createMediaQuery } from "@/lib/primitives/media.js";
import { ResizeHandle } from "@/vendor/ui/components/resize-handle.js";
import FileTree from "@/components/file-tree.js";
import { env } from "@/lib/env.js";
import { useFile } from "@/context/file.js";
import { useLanguage } from "@/context/language.js";
import { useLayout } from "@/context/layout.js";
import { usePlatform } from "@/context/platform.js";
import { useSettings } from "@/context/settings.js";

// Width-transition classes, enabled while the user is NOT actively dragging
// the resize handle. Toggled as a set (the compiled classList split the same
// space-separated string into these tokens).
const TRANSITION_CLASSES = [
  "transition-[width]",
  "duration-200",
  "ease-[cubic-bezier(0.22,1,0.36,1)]",
  "will-change-[width]",
  "motion-reduce:transition-none"
];

function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

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

  // Centered "no files" placeholder. msg is a plain translated string, set
  // via textContent (never interpolated into markup).
  const empty = msg => {
    const el = template(`
      <div class="h-100 d-flex flex-column">
        <div class="h-6 shrink-0" aria-hidden></div>
        <div class="flex-1 pb-64 d-flex align-items-center justify-content-center text-center">
          <div class="small fw-normal text-secondary" data-slot="message"></div>
        </div>
      </div>`);
    el.querySelector('[data-slot="message"]').textContent = msg;
    return el;
  };

  return createComponent(Show, {
    get when() {
      return isDesktop() && shown();
    },
    get children() {
      const root = template(`<div id="file-tree-panel" class="relative min-w-0 h-100 shrink-0 overflow-hidden border-r border"><div class="h-100 d-flex flex-column overflow-hidden"></div></div>`);
      const column = root.firstChild;

      // Close button. It sits inline in the header row (not absolutely
      // positioned) so it lines up vertically with the "すべてのファイル"
      // title; the top/right/z-index inline styles are inert without
      // position-absolute and are kept only for markup parity.
      const close = template(`<button type="button" class="btn btn-link btn-sm p-0 px-1 text-secondary text-decoration-none shrink-0" style="top:3px;right:5px;z-index:6;line-height:1" title="左サイドバーを隠す" aria-label="左サイドバーを隠す"><i class="bi bi-x-lg"></i></button>`);
      close.addEventListener("click", () => layout.fileTree.close());

      // Single file tree (all files). The former "変更" (git-changed) tab was
      // removed — git changes live in the right-hand panel, so a duplicate
      // filter here is redundant — but the "すべてのファイル" header is kept as
      // the panel title.
      const header = document.createElement("div");
      header.className = "shrink-0 d-flex align-items-center justify-content-between px-3 pt-3 pb-1";
      const title = document.createElement("span");
      title.className = "small fw-medium text-secondary text-nowrap flex-shrink-0";
      createEffect(() => {
        title.textContent = language.t("session.files.all");
      });
      // Show WHICH folder is open: decode the session route's :dir param and
      // append the folder name next to the panel title (full path on hover).
      const rootName = document.createElement("span");
      rootName.className = "small fw-normal text-secondary text-truncate ms-1 me-auto min-w-0";
      const routeParams = useParams();
      const openedDir = () => {
        try {
          return base64Decode(routeParams.dir ?? "");
        } catch {
          return "";
        }
      };
      createEffect(() => {
        const dir = openedDir();
        const name = dir ? dir.split(/[\\/]/).filter(Boolean).pop() : "";
        rootName.textContent = name ? `— ${name}` : "";
      });
      createEffect(() => rootName.setAttribute("title", openedDir()));
      header.appendChild(title);
      header.appendChild(rootName);
      header.appendChild(close);
      column.appendChild(header);

      const body = document.createElement("div");
      body.className = "flex-1 min-h-0 bg-body px-3 py-0 overflow-y-auto";
      // Switch/Match equivalent: empty placeholder once the root dir has
      // loaded with no entries, otherwise the tree. Rebuilding inside the
      // effect disposes and remounts the FileTree branch exactly like the
      // compiled Switch did (nofiles is a memo, so the tree is not rebuilt
      // on unrelated tree-state changes).
      createEffect(() => {
        if (nofiles()) {
          body.replaceChildren(empty(language.t("session.files.empty")));
          return;
        }
        body.replaceChildren(createComponent(FileTree, {
          path: "",
          class: "pt-3",
          get modified() {
            return diffFiles();
          },
          get kinds() {
            return kinds();
          },
          onFileClick: node => props.onFileClick(node.path),
          onContextMenu: (node, e) => props.onContextMenu?.(node, e)
        }));
      });
      column.appendChild(body);

      // Show equivalent for the resize handle: mounted only while the pane is
      // open. onCleanup removes the node, and the effect re-run disposes the
      // ResizeHandle scope, so close/open recreates it like <Show> did.
      createEffect(() => {
        if (!fileOpen()) return;
        const handle = document.createElement("div");
        handle.addEventListener("pointerdown", () => props.size.start());
        handle.appendChild(createComponent(ResizeHandle, {
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
        root.appendChild(handle);
        onCleanup(() => handle.remove());
      });

      // Collapsed-state bindings. Split into separate effects so each tracks
      // only its own dependencies (all memo/store-backed, so they dedupe like
      // the compiled change guards did).
      createEffect(() => {
        const closed = !fileOpen();
        root.setAttribute("aria-hidden", closed);
        root.inert = closed;
        root.classList.toggle("pointer-events-none", closed);
      });
      createEffect(() => {
        const animate = !props.size.active();
        for (const cls of TRANSITION_CLASSES) root.classList.toggle(cls, animate);
      });
      createEffect(() => root.style.setProperty("width", treeWidth()));

      return root;
    }
  });
}
