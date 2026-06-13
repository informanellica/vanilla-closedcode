import { createComponent, createEffect, createMemo, createRenderEffect, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { createSortable } from "../../lib/dnd/index.js";
import { IconButton } from "@/bs/icon-button.js";
import { Tabs } from "@/bs/tabs.js";
import { DropdownMenu } from "@/bs/dropdown-menu.js";
import { Icon } from "@/bs/icon.js";
import { isDefaultTitle as isDefaultTerminalTitle } from "@/context/terminal-title.js";
import { useTerminal } from "@/context/terminal.js";
import { useLanguage } from "@/context/language.js";
import { focusTerminalById } from "@/pages/session/helpers.js";

// Build a detached element from compact HTML (no inter-element whitespace,
// matching the compiled Solid templates).
function template(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}

export function SortableTerminalTab(props) {
  const terminal = useTerminal();
  const language = useLanguage();
  const sortable = createSortable(props.terminal.id);
  const [store, setStore] = createStore({
    editing: false,
    title: props.terminal.title,
    menuOpen: false,
    menuPosition: {
      x: 0,
      y: 0
    },
    blurEnabled: false
  });
  let input;
  let blurFrame;
  let editRequested = false;
  const isDefaultTitle = () => {
    const number = props.terminal.titleNumber;
    if (!Number.isFinite(number) || number <= 0) return false;
    return isDefaultTerminalTitle(props.terminal.title, number);
  };
  const label = () => {
    language.locale();
    if (props.terminal.title && !isDefaultTitle()) return props.terminal.title;
    const number = props.terminal.titleNumber;
    if (Number.isFinite(number) && number > 0) return language.t("terminal.title.numbered", {
      number
    });
    if (props.terminal.title) return props.terminal.title;
    return language.t("terminal.title");
  };
  const close = () => {
    const count = terminal.all().length;
    void terminal.close(props.terminal.id);
    if (count === 1) {
      props.onClose?.();
    }
  };
  const focus = () => {
    if (store.editing) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    focusTerminalById(props.terminal.id);
  };
  const edit = e => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setStore("blurEnabled", false);
    setStore("title", props.terminal.title);
    setStore("editing", true);
  };
  const save = () => {
    if (!store.blurEnabled) return;
    const value = store.title.trim();
    if (value && value !== props.terminal.title) {
      terminal.update({
        id: props.terminal.id,
        title: value
      });
    }
    setStore("editing", false);
  };
  const keydown = e => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setStore("editing", false);
    }
  };
  const menu = e => {
    e.preventDefault();
    setStore("menuPosition", {
      x: e.clientX,
      y: e.clientY
    });
    setStore("menuOpen", true);
  };
  // Focus/select the rename input once editing starts. This is a user effect
  // (createEffect), so it runs after the render effect below has built the
  // overlay and bound `input` — same ordering as the compiled Show.
  createEffect(() => {
    if (!store.editing) return;
    if (!input) return;
    input.focus();
    input.select();
    if (blurFrame !== undefined) cancelAnimationFrame(blurFrame);
    blurFrame = requestAnimationFrame(() => {
      blurFrame = undefined;
      setStore("blurEnabled", true);
    });
  });
  onCleanup(() => {
    if (blurFrame === undefined) return;
    cancelAnimationFrame(blurFrame);
  });

  // _tmpl$3: sortable outer wrapper + relative positioning context.
  const root = template(`<div class="outline-none focus:outline-none focus-visible:outline-none h-full"><div class="relative h-full"></div></div>`);
  const wrap = root.firstChild;

  // use:sortable — registers the element as draggable/droppable and applies
  // the sort transform (compiled `use(sortable, el, () => true)`).
  sortable(root, () => true);

  // _tmpl$: tab label span. Double-click starts renaming; the label keeps its
  // width but turns invisible while the rename overlay covers it.
  const labelEl = template(`<span></span>`);
  labelEl.addEventListener("dblclick", edit);
  createRenderEffect(() => {
    labelEl.textContent = label();
  });
  createRenderEffect(() => labelEl.classList.toggle("invisible", !!store.editing));

  wrap.appendChild(createComponent(Tabs.Trigger, {
    get value() {
      return props.terminal.id;
    },
    onClick: focus,
    onMouseDown: e => e.preventDefault(),
    onContextMenu: menu,
    "class": "!shadow-none",
    classes: {
      button: "border-0 outline-none focus:outline-none focus-visible:outline-none !shadow-none !ring-0"
    },
    get closeButton() {
      return createComponent(IconButton, {
        icon: "close",
        variant: "ghost",
        onClick: e => {
          e.stopPropagation();
          close();
        },
        get ["aria-label"]() {
          return language.t("terminal.close");
        }
      });
    },
    children: labelEl
  }));

  wrap.appendChild(createComponent(DropdownMenu, {
    get open() {
      return store.menuOpen;
    },
    onOpenChange: open => setStore("menuOpen", open),
    get children() {
      return createComponent(DropdownMenu.Portal, {
        get children() {
          return createComponent(DropdownMenu.Content, {
            "class": "fixed",
            get style() {
              return {
                left: `${store.menuPosition.x}px`,
                top: `${store.menuPosition.y}px`
              };
            },
            onCloseAutoFocus: e => {
              if (!editRequested) return;
              e.preventDefault();
              editRequested = false;
              requestAnimationFrame(() => edit());
            },
            get children() {
              return [createComponent(DropdownMenu.Item, {
                onSelect: () => editRequested = true,
                get children() {
                  return [createComponent(Icon, {
                    name: "edit",
                    "class": "w-4 h-4 mr-2"
                  }), createMemo(() => language.t("common.rename"))];
                }
              }), createComponent(DropdownMenu.Item, {
                onSelect: close,
                get children() {
                  return [createComponent(Icon, {
                    name: "close",
                    "class": "w-4 h-4 mr-2"
                  }), createMemo(() => language.t("common.close"))];
                }
              })];
            }
          });
        }
      });
    }
  }));

  // Show(store.editing): rename input overlay (_tmpl$2). Rebuilt on every
  // editing start (non-keyed Show on a boolean), appended at the end of the
  // wrapper — the compiled marker-less insert also appended after the
  // dropdown root — and removed when editing ends. `input` keeps pointing at
  // the last built element after unmount, like the compiled ref did.
  let overlay = null;
  createRenderEffect(() => {
    if (!store.editing) {
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
      return;
    }
    if (overlay) return;
    overlay = template(`<div class="absolute inset-0 d-flex align-items-center px-3 bg-muted z-10 pointer-events-auto"><input type="text" class="bg-transparent border-none outline-none text-sm min-w-0 flex-1"></div>`);
    const inputEl = overlay.firstChild;
    inputEl.addEventListener("mousedown", e => e.stopPropagation());
    inputEl.addEventListener("keydown", keydown);
    inputEl.addEventListener("blur", save);
    inputEl.addEventListener("input", e => setStore("title", e.currentTarget.value));
    input = inputEl;
    // Controlled value: owned by this (re)build, disposed with it.
    createRenderEffect(() => inputEl.value = store.title);
    wrap.appendChild(overlay);
  });

  // Compiled effect(): hide the in-flow tab while its drag overlay is active.
  createRenderEffect(() => root.classList.toggle("opacity-0", !!sortable.isActiveDraggable));

  return root;
}
