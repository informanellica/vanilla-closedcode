import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmplRoot$ = /*#__PURE__*/_$template(`<div data-component=tabs>`),
  _tmplTrigger$ = /*#__PURE__*/_$template(`<button type=button data-slot=tabs-trigger>`),
  _tmplClose$ = /*#__PURE__*/_$template(`<span class="d-inline-flex align-items-center" data-slot=tabs-trigger-close-button>`),
  _tmplContent$ = /*#__PURE__*/_$template(`<div data-slot=tabs-content>`),
  _tmplTitle$ = /*#__PURE__*/_$template(`<div class="text-uppercase text-secondary small fw-semibold px-2 pt-2 pb-1" data-slot=tabs-section-title>`);
import { createContext, createMemo, createSignal, Show, splitProps, useContext } from "solid-js";
const TabsContext = /*#__PURE__*/createContext();
function useTabs() {
  return useContext(TabsContext);
}
function TabsRoot(props) {
  const [split, rest] = splitProps(props, ["class", "classList", "variant", "orientation", "value", "defaultValue", "onChange", "children"]);
  const [internal, setInternal] = createSignal(split.defaultValue);
  const value = createMemo(() => split.value !== undefined ? split.value : internal());
  const select = next => {
    if (split.value === undefined) setInternal(next);
    split.onChange?.(next);
  };
  const orientation = () => split.orientation || "horizontal";
  const ctx = {
    value,
    select,
    orientation,
    get variant() {
      return split.variant || "normal";
    }
  };
  return _$createComponent(TabsContext.Provider, {
    value: ctx,
    get children() {
      return (() => {
        var _el$ = _tmplRoot$();
        _$spread(_el$, _$mergeProps({
          "data-component": "tabs",
          get ["data-variant"]() {
            return split.variant || "normal";
          },
          get ["data-orientation"]() {
            return orientation();
          },
          get classList() {
            return {
              ...split.classList,
              "d-flex": true,
              "flex-row": orientation() === "vertical",
              "flex-column": orientation() !== "vertical",
              [split.class ?? ""]: !!split.class
            };
          }
        }, rest), false, true);
        _$insert(_el$, () => split.children);
        return _el$;
      })();
    }
  });
}
function TabsList(props) {
  const tabs = useTabs();
  const [split, rest] = splitProps(props, ["class", "classList", "children"]);
  const vertical = () => tabs?.orientation() === "vertical";
  return (() => {
    var _el$ = _tmplRoot$();
    _$spread(_el$, _$mergeProps({
      role: "tablist",
      "data-slot": "tabs-list",
      get ["data-orientation"]() {
        return tabs?.orientation() || "horizontal";
      },
      get classList() {
        return {
          ...split.classList,
          nav: true,
          "nav-pills": true,
          "flex-column": vertical(),
          [split.class ?? ""]: !!split.class
        };
      }
    }, rest), false, true);
    _$insert(_el$, () => split.children);
    return _el$;
  })();
}
function TabsTrigger(props) {
  const tabs = useTabs();
  const [split, rest] = splitProps(props, ["class", "classList", "classes", "children", "value", "closeButton", "hideCloseButton", "onMiddleClick", "onClick"]);
  const active = createMemo(() => tabs?.value() === split.value);
  return (() => {
    var _el$ = _tmplTrigger$();
    _el$.addEventListener("auxclick", e => {
      if (e.button === 1 && split.onMiddleClick) {
        e.preventDefault();
        split.onMiddleClick();
      }
    });
    _el$.addEventListener("mousedown", e => {
      if (e.button === 1 && split.onMiddleClick) {
        e.preventDefault();
      }
    });
    _el$.addEventListener("click", e => {
      tabs?.select(split.value);
      split.onClick?.(e);
    });
    _$spread(_el$, _$mergeProps({
      role: "tab",
      "data-slot": "tabs-trigger",
      get ["data-value"]() {
        return split.value;
      },
      get ["aria-selected"]() {
        return active() ? "true" : "false";
      },
      get classList() {
        return {
          ...split.classList,
          "nav-link": true,
          "d-inline-flex align-items-center gap-1": true,
          active: active(),
          [split.classes?.button ?? ""]: !!split.classes?.button,
          [split.class ?? ""]: !!split.class
        };
      }
    }, rest), false, true);
    _$insert(_el$, () => split.children, null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return split.closeButton;
      },
      children: closeButton => (() => {
        var _el$2 = _tmplClose$();
        _$insert(_el$2, () => typeof closeButton === "function" ? closeButton() : closeButton);
        _$effect(() => _$setAttribute(_el$2, "data-hidden", split.hideCloseButton ? "true" : "false"));
        return _el$2;
      })()
    }), null);
    return _el$;
  })();
}
function TabsContent(props) {
  const tabs = useTabs();
  const [split, rest] = splitProps(props, ["class", "classList", "children", "value"]);
  const active = createMemo(() => tabs?.value() === split.value);
  return (() => {
    var _el$ = _tmplContent$();
    _$spread(_el$, _$mergeProps({
      role: "tabpanel",
      "data-slot": "tabs-content",
      get ["data-value"]() {
        return split.value;
      },
      get classList() {
        return {
          ...split.classList,
          "tab-pane": true,
          active: active(),
          "d-none": !active(),
          [split.class ?? ""]: !!split.class
        };
      }
    }, rest), false, true);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return active();
      },
      get children() {
        return _$memo(() => split.children);
      }
    }));
    return _el$;
  })();
}
const TabsSectionTitle = props => {
  return (() => {
    var _el$ = _tmplTitle$();
    _$insert(_el$, () => props.children);
    return _el$;
  })();
};
export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
  SectionTitle: TabsSectionTitle
});
