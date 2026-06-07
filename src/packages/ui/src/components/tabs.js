import { template as _$template } from "solid-js/web";
import { delegateEvents as _$delegateEvents } from "solid-js/web";
import { classList as _$classList } from "solid-js/web";
import { setAttribute as _$setAttribute } from "solid-js/web";
import { effect as _$effect } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=tabs-trigger-wrapper>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div data-slot=tabs-trigger-close-button>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div data-slot=tabs-section-title>`);
import { Tabs as Kobalte } from "@kobalte/core/tabs";
import { Show, splitProps } from "solid-js";
function TabsRoot(props) {
  const [split, rest] = splitProps(props, ["class", "classList", "variant", "orientation"]);
  return _$createComponent(Kobalte, _$mergeProps(rest, {
    get orientation() {
      return split.orientation;
    },
    "data-component": "tabs",
    get ["data-variant"]() {
      return split.variant || "normal";
    },
    get ["data-orientation"]() {
      return split.orientation || "horizontal";
    },
    get classList() {
      return {
        ...split.classList,
        [split.class ?? ""]: !!split.class
      };
    }
  }));
}
function TabsList(props) {
  const [split, rest] = splitProps(props, ["class", "classList"]);
  return _$createComponent(Kobalte.List, _$mergeProps(rest, {
    "data-slot": "tabs-list",
    get classList() {
      return {
        ...split.classList,
        [split.class ?? ""]: !!split.class
      };
    }
  }));
}
function TabsTrigger(props) {
  const [split, rest] = splitProps(props, ["class", "classList", "classes", "children", "closeButton", "hideCloseButton", "onMiddleClick"]);
  return (() => {
    var _el$ = _tmpl$();
    _el$.addEventListener("auxclick", e => {
      if (e.button === 1 && split.onMiddleClick) {
        e.preventDefault();
        split.onMiddleClick();
      }
    });
    _el$.$$mousedown = e => {
      if (e.button === 1 && split.onMiddleClick) {
        e.preventDefault();
      }
    };
    _$insert(_el$, _$createComponent(Kobalte.Trigger, _$mergeProps(rest, {
      "data-slot": "tabs-trigger",
      get ["data-value"]() {
        return props.value;
      },
      get classList() {
        return {
          [split.classes?.button ?? ""]: split.classes?.button
        };
      },
      get children() {
        return split.children;
      }
    })), null);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return split.closeButton;
      },
      children: closeButton => (() => {
        var _el$2 = _tmpl$2();
        _$insert(_el$2, closeButton);
        _$effect(() => _$setAttribute(_el$2, "data-hidden", split.hideCloseButton));
        return _el$2;
      })()
    }), null);
    _$effect(_p$ => {
      var _v$ = props.value,
        _v$2 = {
          ...split.classList,
          [split.class ?? ""]: !!split.class
        };
      _v$ !== _p$.e && _$setAttribute(_el$, "data-value", _p$.e = _v$);
      _p$.t = _$classList(_el$, _v$2, _p$.t);
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$;
  })();
}
function TabsContent(props) {
  const [split, rest] = splitProps(props, ["class", "classList", "children"]);
  return _$createComponent(Kobalte.Content, _$mergeProps(rest, {
    "data-slot": "tabs-content",
    get classList() {
      return {
        ...split.classList,
        [split.class ?? ""]: !!split.class
      };
    },
    get children() {
      return split.children;
    }
  }));
}
const TabsSectionTitle = props => {
  return (() => {
    var _el$3 = _tmpl$3();
    _$insert(_el$3, () => props.children);
    return _el$3;
  })();
};
export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
  SectionTitle: TabsSectionTitle
});
_$delegateEvents(["mousedown"]);