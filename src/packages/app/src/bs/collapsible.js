import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
var _tmplArrow$ = /*#__PURE__*/_$template(`<span data-component=collapsible-arrow data-slot=collapsible-arrow><span data-slot=collapsible-arrow-icon>`);
import { createContext, createSignal, createMemo, splitProps, useContext, Show } from "solid-js";
import { Icon } from "@/bs/icon.js";

const CollapsibleContext = createContext();

function useCollapsible() {
  return useContext(CollapsibleContext);
}

function CollapsibleRoot(props) {
  const [local, others] = splitProps(props, ["class", "classList", "variant", "open", "defaultOpen", "onOpenChange", "forceMount", "disabled", "children"]);
  const [uncontrolled, setUncontrolled] = createSignal(!!local.defaultOpen);
  const isOpen = createMemo(() => (local.open !== undefined ? !!local.open : uncontrolled()));
  const setOpen = next => {
    const value = typeof next === "function" ? next(isOpen()) : next;
    if (local.open === undefined) setUncontrolled(value);
    local.onOpenChange?.(value);
  };
  const toggle = () => {
    if (local.disabled) return;
    setOpen(v => !v);
  };
  const ctx = {
    isOpen,
    setOpen,
    toggle,
    get disabled() {
      return !!local.disabled;
    },
    get forceMount() {
      return !!local.forceMount;
    }
  };
  return _$createComponent(CollapsibleContext.Provider, {
    value: ctx,
    get children() {
      return (() => {
        var _el$ = document.createElement("div");
        _$spread(_el$, _$mergeProps({
          "data-component": "collapsible",
          get ["data-variant"]() {
            return local.variant || "normal";
          },
          get ["data-expanded"]() {
            return isOpen() ? "" : undefined;
          },
          get ["data-closed"]() {
            return isOpen() ? undefined : "";
          },
          get ["data-disabled"]() {
            return local.disabled ? "" : undefined;
          },
          get classList() {
            return {
              ...local.classList,
              [local.class ?? ""]: !!local.class
            };
          }
        }, others), false, true);
        _$insert(_el$, () => local.children);
        return _el$;
      })();
    }
  });
}

function CollapsibleTrigger(props) {
  const ctx = useCollapsible();
  const [local, others] = splitProps(props, ["class", "classList", "onClick", "children"]);
  return (() => {
    var _el$ = document.createElement("button");
    _$spread(_el$, _$mergeProps({
      type: "button",
      "data-slot": "collapsible-trigger",
      get ["data-expanded"]() {
        return ctx?.isOpen() ? "" : undefined;
      },
      get ["data-closed"]() {
        return ctx?.isOpen() ? undefined : "";
      },
      get ["aria-expanded"]() {
        return ctx?.isOpen() ? "true" : "false";
      },
      get disabled() {
        return ctx?.disabled || undefined;
      },
      get classList() {
        return {
          ...local.classList,
          [local.class ?? ""]: !!local.class
        };
      }
    }, others), false, true);
    _el$.addEventListener("click", e => {
      local.onClick?.(e);
      if (!e.defaultPrevented) ctx?.toggle();
    });
    _$insert(_el$, () => local.children);
    return _el$;
  })();
}

function CollapsibleContent(props) {
  const ctx = useCollapsible();
  const [local, others] = splitProps(props, ["class", "classList", "children"]);
  return _$createComponent(Show, {
    get when() {
      return ctx?.forceMount || ctx?.isOpen();
    },
    get children() {
      return (() => {
        var _el$ = document.createElement("div");
        _$spread(_el$, _$mergeProps({
          "data-slot": "collapsible-content",
          get ["data-expanded"]() {
            return ctx?.isOpen() ? "" : undefined;
          },
          get ["data-closed"]() {
            return ctx?.isOpen() ? undefined : "";
          },
          get classList() {
            return {
              ...local.classList,
              [local.class ?? ""]: !!local.class
            };
          }
        }, others), false, true);
        _$effect(() => _$setAttribute(_el$, "hidden", ctx?.isOpen() ? undefined : ""));
        _$insert(_el$, () => local.children);
        return _el$;
      })();
    }
  });
}

function CollapsibleArrow(props) {
  return (() => {
    var _el$ = _tmplArrow$(),
      _el$2 = _el$.firstChild;
    _$spread(_el$, props || {}, false, true);
    _$insert(_el$2, _$createComponent(Icon, {
      name: "chevron-down",
      size: "small"
    }));
    return _el$;
  })();
}

export const Collapsible = Object.assign(CollapsibleRoot, {
  Arrow: CollapsibleArrow,
  Trigger: CollapsibleTrigger,
  Content: CollapsibleContent
});
