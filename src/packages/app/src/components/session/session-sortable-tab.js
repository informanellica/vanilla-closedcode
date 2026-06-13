import { createComponent, createMemo, createRenderEffect } from "solid-js";
import { createSortable } from "../../lib/dnd/index.js";
import { FileIcon } from "@/vendor/ui/components/file-icon.js";
import { IconButton } from "@/bs/icon-button.js";
import { TooltipKeybind } from "@/bs/tooltip.js";
import { Tabs } from "@/bs/tabs.js";
import { getFilename } from "core/util/path";
import { useFile } from "@/context/file.js";
import { useLanguage } from "@/context/language.js";
import { useCommand } from "@/context/command.js";
import { useEditorDirty } from "@/lib/editor-dirty.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

export function FileVisual(props) {
  const editorDirty = useEditorDirty();
  const root = template(`<div class="d-flex align-items-center gap-x-1.5 min-w-0"><span class="fw-medium truncate"></span></div>`);
  const nameEl = root.firstChild;

  // Show(!props.active), non-keyed: the icon region is rebuilt only when the
  // boolean flips. FileIcon reads its props once (createComponent untracks),
  // so this effect tracks only the condition — exactly like the compiled Show.
  // The node(s) are inserted directly before the name span (no wrapper) to
  // keep the DOM identical to the compiled output.
  const inactive = createMemo(() => !props.active);
  let iconEl = null;
  createRenderEffect(() => {
    let next;
    if (inactive()) {
      // Stacked color + mono icons; CSS swaps them on hover/selected.
      next = template(`<span class="relative inline-flex size-4 shrink-0"></span>`);
      next.appendChild(createComponent(FileIcon, {
        get node() {
          return { path: props.path, type: "file" };
        },
        class: "absolute inset-0 size-4 tab-fileicon-color"
      }));
      next.appendChild(createComponent(FileIcon, {
        get node() {
          return { path: props.path, type: "file" };
        },
        mono: true,
        class: "absolute inset-0 size-4 tab-fileicon-mono"
      }));
    } else {
      next = createComponent(FileIcon, {
        get node() {
          return { path: props.path, type: "file" };
        },
        class: "size-4 shrink-0"
      });
    }
    if (iconEl) iconEl.remove();
    iconEl = next;
    root.insertBefore(next, nameEl);
  });

  // Compiled insert(() => getFilename(props.path)): live filename text.
  createRenderEffect(() => {
    const name = getFilename(props.path);
    nameEl.textContent = name == null ? "" : String(name);
  });

  // Show(editorDirty.isDirty(path)): unsaved-changes dot appended after the
  // name span. Boolean memo so truthy-to-truthy updates don't rebuild.
  const dirty = createMemo(() => !!editorDirty.isDirty(props.path));
  let dirtyEl = null;
  createRenderEffect(() => {
    const show = dirty();
    if (dirtyEl) {
      dirtyEl.remove();
      dirtyEl = null;
    }
    if (show) {
      dirtyEl = template(`<span class="text-warning small ms-1" title="未保存の変更" aria-hidden="true">●</span>`);
      root.appendChild(dirtyEl);
    }
  });

  return root;
}

export function SortableTab(props) {
  const file = useFile();
  const language = useLanguage();
  const command = useCommand();
  const sortable = createSortable(props.tab);
  const path = createMemo(() => file.pathFromTab(props.tab));
  const content = createMemo(() => {
    const value = path();
    if (!value) return;
    return createComponent(FileVisual, {
      path: value
    });
  });

  const root = template(`<div class="h-full d-flex align-items-center"><div class="relative"></div></div>`);
  const wrap = root.firstChild;

  // use:sortable — the directive registers the element as draggable/droppable
  // and applies the sort transform (compiled `use(sortable, el, () => true)`).
  sortable(root, () => true);

  wrap.appendChild(createComponent(Tabs.Trigger, {
    get value() {
      return props.tab;
    },
    get closeButton() {
      return createComponent(TooltipKeybind, {
        get title() {
          return language.t("common.closeTab");
        },
        get keybind() {
          return command.keybind("tab.close");
        },
        placement: "bottom",
        gutter: 10,
        get children() {
          return createComponent(IconButton, {
            icon: "close-small",
            variant: "ghost",
            class: "h-5 w-5",
            onClick: () => props.onTabClose(props.tab),
            get ["aria-label"]() {
              return language.t("common.closeTab");
            }
          });
        }
      });
    },
    hideCloseButton: true,
    onMiddleClick: () => props.onTabClose(props.tab),
    // Show(content()) equivalent: hand the memo accessor straight to the
    // trigger — Tabs.Trigger routes function children through solid insert(),
    // which re-renders the label whenever the path-derived content changes.
    children: content
  }));

  // Compiled effect(): hide the in-flow tab while its drag overlay is active.
  createRenderEffect(() => root.classList.toggle("opacity-0", !!sortable.isActiveDraggable));

  return root;
}
