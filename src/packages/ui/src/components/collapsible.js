import { template as _$template } from "solid-js/web";
import { insert as _$insert } from "solid-js/web";
import { spread as _$spread } from "solid-js/web";
import { createComponent as _$createComponent } from "solid-js/web";
import { mergeProps as _$mergeProps } from "solid-js/web";
import { memo as _$memo } from "solid-js/web";
var _tmpl$ = /*#__PURE__*/_$template(`<div data-slot=collapsible-arrow><span data-slot=collapsible-arrow-icon>`);
import { Collapsible as Kobalte } from "@kobalte/core/collapsible";
import { splitProps } from "solid-js";
import { Icon } from "./icon.js";
function CollapsibleRoot(props) {
  const [local, others] = splitProps(props, ["class", "classList", "variant"]);
  return _$createComponent(Kobalte, _$mergeProps({
    "data-component": "collapsible",
    get ["data-variant"]() {
      return local.variant || "normal";
    },
    get classList() {
      return {
        ...local.classList,
        [local.class ?? ""]: !!local.class
      };
    }
  }, others));
}
function CollapsibleTrigger(props) {
  return _$createComponent(Kobalte.Trigger, _$mergeProps({
    "data-slot": "collapsible-trigger"
  }, props));
}
function CollapsibleContent(props) {
  return _$createComponent(Kobalte.Content, _$mergeProps({
    "data-slot": "collapsible-content"
  }, props));
}
function CollapsibleArrow(props) {
  return (() => {
    var _el$ = _tmpl$(),
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