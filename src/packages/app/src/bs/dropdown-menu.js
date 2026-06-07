import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { Dynamic as _$Dynamic } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { Portal as _$Portal } from "solid-js/web";
import { createContext, createSignal, createUniqueId, onCleanup, Show, splitProps, useContext } from "solid-js";
import { Icon } from "@/bs/icon.js";

var _tmplRoot$ = /*#__PURE__*/_$template(`<div data-component=dropdown-menu>`);
var _tmplContent$ = /*#__PURE__*/_$template(`<div data-component=dropdown-menu-content role=menu>`);
var _tmplSeparator$ = /*#__PURE__*/_$template(`<div data-slot=dropdown-menu-separator role=separator>`);
var _tmplGroup$ = /*#__PURE__*/_$template(`<div data-slot=dropdown-menu-group role=group>`);
var _tmplGroupLabel$ = /*#__PURE__*/_$template(`<div data-slot=dropdown-menu-group-label>`);
var _tmplItem$ = /*#__PURE__*/_$template(`<button type=button data-slot=dropdown-menu-item role=menuitem>`);
var _tmplItemLabel$ = /*#__PURE__*/_$template(`<span data-slot=dropdown-menu-item-label>`);
var _tmplItemDescription$ = /*#__PURE__*/_$template(`<span data-slot=dropdown-menu-item-description>`);
var _tmplIndicator$ = /*#__PURE__*/_$template(`<span data-slot=dropdown-menu-item-indicator>`);
var _tmplIcon$ = /*#__PURE__*/_$template(`<span data-slot=dropdown-menu-icon>`);
var _tmplRadioGroup$ = /*#__PURE__*/_$template(`<div data-slot=dropdown-menu-radio-group role=group>`);

const PLACEMENT_CLASS = {
  bottom: "dropdown-menu-start",
  "bottom-start": "dropdown-menu-start",
  "bottom-end": "dropdown-menu-end",
  top: "dropdown-menu-start",
  "top-start": "dropdown-menu-start",
  "top-end": "dropdown-menu-end"
};

const DropdownContext = createContext();
const RadioContext = createContext();

function useDropdown() {
  return useContext(DropdownContext);
}

function DropdownMenuRoot(props) {
  const [local, rest] = splitProps(props, ["open", "onOpenChange", "gutter", "placement", "class", "classList", "children"]);
  const [uncontrolled, setUncontrolled] = createSignal(false);
  const isControlled = () => local.open !== undefined;
  const isOpen = () => (isControlled() ? !!local.open : uncontrolled());
  const setOpen = value => {
    if (!isControlled()) setUncontrolled(value);
    local.onOpenChange?.(value);
  };
  const toggle = () => setOpen(!isOpen());
  const close = () => setOpen(false);
  const triggerId = createUniqueId();
  let rootEl;
  let triggerEl;
  let contentEl;
  const ctx = {
    isOpen,
    setOpen,
    toggle,
    close,
    triggerId,
    placement: () => local.placement,
    gutter: () => local.gutter,
    trigger: () => triggerEl,
    registerRoot: el => (rootEl = el),
    registerTrigger: el => (triggerEl = el),
    registerContent: el => (contentEl = el)
  };
  const onDocPointer = event => {
    if (!isOpen()) return;
    if (rootEl && rootEl.contains(event.target)) return;
    if (contentEl && contentEl.contains(event.target)) return;
    close();
  };
  const onKeyDown = event => {
    if (event.key === "Escape" && isOpen()) close();
  };
  return _$createComponent(DropdownContext.Provider, {
    value: ctx,
    get children() {
      return (() => {
        var _el$ = _tmplRoot$();
        ctx.registerRoot(_el$);
        document.addEventListener("pointerdown", onDocPointer, true);
        document.addEventListener("keydown", onKeyDown, true);
        onCleanup(() => {
          document.removeEventListener("pointerdown", onDocPointer, true);
          document.removeEventListener("keydown", onKeyDown, true);
        });
        _$spread(_el$, _$mergeProps({
          get classList() {
            return {
              ...local.classList,
              dropdown: true,
              "d-inline-block": true,
              show: isOpen(),
              [local.class ?? ""]: !!local.class
            };
          }
        }, rest), false, true);
        _$insert(_el$, () => local.children);
        return _el$;
      })();
    }
  });
}

function DropdownMenuTrigger(props) {
  const ctx = useDropdown();
  const [local, rest] = splitProps(props, ["as", "class", "classList", "onClick", "children", "ref"]);
  return _$createComponent(_$Dynamic, _$mergeProps({
    get component() {
      return local.as || "button";
    }
  }, rest, {
    "data-slot": "dropdown-menu-trigger",
    "aria-haspopup": "menu",
    get id() {
      return ctx?.triggerId;
    },
    get ["aria-expanded"]() {
      return ctx?.isOpen() ? "true" : "false";
    },
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    },
    onClick: event => {
      local.onClick?.(event);
      if (event?.defaultPrevented) return;
      ctx?.toggle();
    },
    ref: el => {
      ctx?.registerTrigger?.(el);
      local.ref?.(el);
    },
    get children() {
      return local.children;
    }
  }));
}

function DropdownMenuIcon(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (() => {
    var _el$ = _tmplIcon$();
    _$spread(_el$, _$mergeProps({
      get classList() {
        return {
          ...local.classList,
          [local.class ?? ""]: !!local.class
        };
      }
    }, rest), false, true);
    _$insert(_el$, () => local.children);
    return _el$;
  })();
}

function DropdownMenuPortal(props) {
  const ctx = useDropdown();
  return _$createComponent(Show, {
    get when() {
      return ctx ? ctx.isOpen() : true;
    },
    get children() {
      return _$createComponent(_$Portal, {
        get children() {
          return props.children;
        }
      });
    }
  });
}

function DropdownMenuContent(props) {
  const ctx = useDropdown();
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  const placementClass = () => PLACEMENT_CLASS[ctx?.placement?.()] ?? "";
  return (() => {
    var _el$ = _tmplContent$();
    _$spread(_el$, _$mergeProps({
      "data-slot": "dropdown-menu-content",
      get classList() {
        return {
          ...local.classList,
          "dropdown-menu": true,
          show: ctx ? ctx.isOpen() : true,
          [placementClass()]: !!placementClass(),
          [local.class ?? ""]: !!local.class
        };
      }
    }, rest), false, true);
    ctx?.registerContent?.(_el$);
    onCleanup(() => ctx?.registerContent?.(undefined));
    _$effect(() => {
      const open = ctx ? ctx.isOpen() : true;
      const trigger = ctx?.trigger?.();
      const gutter = Number(ctx?.gutter?.() ?? 4);
      _el$.style.cssText = "position:fixed;z-index:2050;";
      if (!open) return;
      requestAnimationFrame(() => {
        if (!_el$.isConnected || !trigger) return;
        const pad = 8;
        const tr = trigger.getBoundingClientRect();
        const r = _el$.getBoundingClientRect();
        const placement = ctx?.placement?.() ?? "bottom-start";
        const alignEnd = placement.endsWith("-end");
        const preferTop = placement.startsWith("top");
        let left = alignEnd ? tr.right - r.width : tr.left;
        let top = preferTop ? tr.top - r.height - gutter : tr.bottom + gutter;
        if (!preferTop && top + r.height > window.innerHeight - pad) top = tr.top - r.height - gutter;
        if (preferTop && top < pad) top = tr.bottom + gutter;
        left = Math.max(pad, Math.min(left, window.innerWidth - r.width - pad));
        top = Math.max(pad, Math.min(top, window.innerHeight - r.height - pad));
        _el$.style.left = `${left}px`;
        _el$.style.top = `${top}px`;
      });
    });
    _$insert(_el$, () => local.children);
    return _el$;
  })();
}

function DropdownMenuArrow(props) {
  return null;
}

function DropdownMenuSeparator(props) {
  const [local, rest] = splitProps(props, ["class", "classList"]);
  return (() => {
    var _el$ = _tmplSeparator$();
    _$spread(_el$, _$mergeProps({
      get classList() {
        return {
          ...local.classList,
          "dropdown-divider": true,
          [local.class ?? ""]: !!local.class
        };
      }
    }, rest), false, true);
    return _el$;
  })();
}

function DropdownMenuGroup(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (() => {
    var _el$ = _tmplGroup$();
    _$spread(_el$, _$mergeProps({
      get classList() {
        return {
          ...local.classList,
          [local.class ?? ""]: !!local.class
        };
      }
    }, rest), false, true);
    _$insert(_el$, () => local.children);
    return _el$;
  })();
}

function DropdownMenuGroupLabel(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (() => {
    var _el$ = _tmplGroupLabel$();
    _$spread(_el$, _$mergeProps({
      get classList() {
        return {
          ...local.classList,
          "dropdown-header": true,
          [local.class ?? ""]: !!local.class
        };
      }
    }, rest), false, true);
    _$insert(_el$, () => local.children);
    return _el$;
  })();
}

function DropdownMenuItem(props) {
  const ctx = useDropdown();
  const [local, rest] = splitProps(props, ["class", "classList", "children", "onSelect", "disabled", "closeOnSelect"]);
  return (() => {
    var _el$ = _tmplItem$();
    _$spread(_el$, _$mergeProps({
      "aria-disabled": undefined,
      get classList() {
        return {
          ...local.classList,
          "dropdown-item": true,
          "d-flex": true,
          "align-items-center": true,
          "gap-2": true,
          disabled: !!local.disabled,
          [local.class ?? ""]: !!local.class
        };
      }
    }, rest), false, true);
    _$effect(() => {
      _el$.disabled = !!local.disabled;
    });
    _el$.addEventListener("click", event => {
      if (local.disabled) return;
      local.onSelect?.(event);
      if (local.closeOnSelect === false) return;
      ctx?.close();
    });
    _$insert(_el$, () => local.children);
    return _el$;
  })();
}

function DropdownMenuItemLabel(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (() => {
    var _el$ = _tmplItemLabel$();
    _$spread(_el$, _$mergeProps({
      get classList() {
        return {
          ...local.classList,
          "flex-grow-1": true,
          [local.class ?? ""]: !!local.class
        };
      }
    }, rest), false, true);
    _$insert(_el$, () => local.children);
    return _el$;
  })();
}

function DropdownMenuItemDescription(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);
  return (() => {
    var _el$ = _tmplItemDescription$();
    _$spread(_el$, _$mergeProps({
      get classList() {
        return {
          ...local.classList,
          "text-muted": true,
          small: true,
          [local.class ?? ""]: !!local.class
        };
      }
    }, rest), false, true);
    _$insert(_el$, () => local.children);
    return _el$;
  })();
}

function DropdownMenuItemIndicator(props) {
  const radio = useContext(RadioContext);
  const [local, rest] = splitProps(props, ["class", "classList", "children", "forceMount"]);
  const visible = () => local.forceMount || !radio || radio.isSelected();
  return _$createComponent(Show, {
    get when() {
      return visible();
    },
    get children() {
      var _el$ = _tmplIndicator$();
      _$spread(_el$, _$mergeProps({
        get classList() {
          return {
            ...local.classList,
            [local.class ?? ""]: !!local.class
          };
        }
      }, rest), false, true);
      _$insert(_el$, () => local.children ?? _$createComponent(Icon, {
        name: "check"
      }));
      return _el$;
    }
  });
}

function DropdownMenuRadioGroup(props) {
  const [local, rest] = splitProps(props, ["class", "classList", "children", "value", "onChange"]);
  const ctx = {
    value: () => local.value,
    onChange: v => local.onChange?.(v)
  };
  return _$createComponent(RadioContext.Provider, {
    value: ctx,
    get children() {
      var _el$ = _tmplRadioGroup$();
      _$spread(_el$, _$mergeProps({
        get classList() {
          return {
            ...local.classList,
            [local.class ?? ""]: !!local.class
          };
        }
      }, rest), false, true);
      _$insert(_el$, () => local.children);
      return _el$;
    }
  });
}

function DropdownMenuRadioItem(props) {
  const dropdown = useDropdown();
  const group = useContext(RadioContext);
  const [local, rest] = splitProps(props, ["class", "classList", "children", "value", "onSelect", "disabled", "closeOnSelect"]);
  const isSelected = () => !!group && group.value() === local.value;
  const itemCtx = {
    isSelected
  };
  return _$createComponent(RadioContext.Provider, {
    get value() {
      return _$mergeProps(group ?? {}, itemCtx);
    },
    get children() {
      var _el$ = _tmplItem$();
      _$setAttribute(_el$, "role", "menuitemradio");
      _$spread(_el$, _$mergeProps({
        get classList() {
          return {
            ...local.classList,
            "dropdown-item": true,
            "d-flex": true,
            "align-items-center": true,
            "gap-2": true,
            active: isSelected(),
            disabled: !!local.disabled,
            [local.class ?? ""]: !!local.class
          };
        }
      }, rest), false, true);
      _$effect(() => {
        _el$.disabled = !!local.disabled;
      });
      _$effect(() => _$setAttribute(_el$, "aria-checked", isSelected() ? "true" : "false"));
      _el$.addEventListener("click", event => {
        if (local.disabled) return;
        group?.onChange(local.value);
        local.onSelect?.(event);
        if (local.closeOnSelect === false) return;
        dropdown?.close();
      });
      _$insert(_el$, () => local.children);
      return _el$;
    }
  });
}

function DropdownMenuCheckboxItem(props) {
  const dropdown = useDropdown();
  const [local, rest] = splitProps(props, ["class", "classList", "children", "checked", "onChange", "onSelect", "disabled", "closeOnSelect"]);
  const itemCtx = {
    isSelected: () => !!local.checked
  };
  return _$createComponent(RadioContext.Provider, {
    value: itemCtx,
    get children() {
      var _el$ = _tmplItem$();
      _$setAttribute(_el$, "role", "menuitemcheckbox");
      _$spread(_el$, _$mergeProps({
        get classList() {
          return {
            ...local.classList,
            "dropdown-item": true,
            "d-flex": true,
            "align-items-center": true,
            "gap-2": true,
            active: !!local.checked,
            disabled: !!local.disabled,
            [local.class ?? ""]: !!local.class
          };
        }
      }, rest), false, true);
      _$effect(() => {
        _el$.disabled = !!local.disabled;
      });
      _$effect(() => _$setAttribute(_el$, "aria-checked", local.checked ? "true" : "false"));
      _el$.addEventListener("click", event => {
        if (local.disabled) return;
        local.onChange?.(!local.checked);
        local.onSelect?.(event);
        if (local.closeOnSelect === false) return;
        dropdown?.close();
      });
      _$insert(_el$, () => local.children);
      return _el$;
    }
  });
}

function DropdownMenuSub(props) {
  return _$createComponent(DropdownMenuRoot, props);
}

function DropdownMenuSubTrigger(props) {
  return _$createComponent(DropdownMenuTrigger, props);
}

function DropdownMenuSubContent(props) {
  return _$createComponent(DropdownMenuContent, props);
}

export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Trigger: DropdownMenuTrigger,
  Icon: DropdownMenuIcon,
  Portal: DropdownMenuPortal,
  Content: DropdownMenuContent,
  Arrow: DropdownMenuArrow,
  Separator: DropdownMenuSeparator,
  Group: DropdownMenuGroup,
  GroupLabel: DropdownMenuGroupLabel,
  Item: DropdownMenuItem,
  ItemLabel: DropdownMenuItemLabel,
  ItemDescription: DropdownMenuItemDescription,
  ItemIndicator: DropdownMenuItemIndicator,
  RadioGroup: DropdownMenuRadioGroup,
  RadioItem: DropdownMenuRadioItem,
  CheckboxItem: DropdownMenuCheckboxItem,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent
});
