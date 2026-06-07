import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { use as _$use } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<span>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class="absolute inset-0 d-flex align-items-center px-3 bg-muted z-10 pointer-events-auto"><input type=text class="bg-transparent border-none outline-none text-sm min-w-0 flex-1">`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div class="outline-none focus:outline-none focus-visible:outline-none h-full"><div class="relative h-full">`);
import { Show, createEffect, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { createSortable } from "@thisbeyond/solid-dnd";
import { IconButton } from "@/bs/icon-button.js";
import { Tabs } from "@/bs/tabs.js";
import { DropdownMenu } from "@/bs/dropdown-menu.js";
import { Icon } from "@/bs/icon.js";
import { isDefaultTitle as isDefaultTerminalTitle } from "@/context/terminal-title.js";
import { useTerminal } from "@/context/terminal.js";
import { useLanguage } from "@/context/language.js";
import { focusTerminalById } from "@/pages/session/helpers.js";
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
  return (() => {
    var _el$ = _tmpl$3(),
      _el$2 = _el$.firstChild;
    _$use(sortable, _el$, () => true);
    _$insert(_el$2, _$createComponent(Tabs.Trigger, {
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
        return _$createComponent(IconButton, {
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
      get children() {
        var _el$3 = _tmpl$();
        _el$3.$$dblclick = edit;
        _$insert(_el$3, label);
        _$effect(() => _el$3.classList.toggle("invisible", !!store.editing));
        return _el$3;
      }
    }), null);
    _$insert(_el$2, _$createComponent(Show, {
      get when() {
        return store.editing;
      },
      get children() {
        var _el$4 = _tmpl$2(),
          _el$5 = _el$4.firstChild;
        _el$5.$$mousedown = e => e.stopPropagation();
        _el$5.$$keydown = keydown;
        _el$5.addEventListener("blur", save);
        _el$5.$$input = e => setStore("title", e.currentTarget.value);
        var _ref$ = input;
        typeof _ref$ === "function" ? _$use(_ref$, _el$5) : input = _el$5;
        _$effect(() => _el$5.value = store.title);
        return _el$4;
      }
    }), null);
    _$insert(_el$2, _$createComponent(DropdownMenu, {
      get open() {
        return store.menuOpen;
      },
      onOpenChange: open => setStore("menuOpen", open),
      get children() {
        return _$createComponent(DropdownMenu.Portal, {
          get children() {
            return _$createComponent(DropdownMenu.Content, {
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
                return [_$createComponent(DropdownMenu.Item, {
                  onSelect: () => editRequested = true,
                  get children() {
                    return [_$createComponent(Icon, {
                      name: "edit",
                      "class": "w-4 h-4 mr-2"
                    }), _$memo(() => language.t("common.rename"))];
                  }
                }), _$createComponent(DropdownMenu.Item, {
                  onSelect: close,
                  get children() {
                    return [_$createComponent(Icon, {
                      name: "close",
                      "class": "w-4 h-4 mr-2"
                    }), _$memo(() => language.t("common.close"))];
                  }
                })];
              }
            });
          }
        });
      }
    }), null);
    _$effect(() => _el$.classList.toggle("opacity-0", !!sortable.isActiveDraggable));
    return _el$;
  })();
}
_$delegateEvents(["dblclick", "input", "keydown", "mousedown"]);